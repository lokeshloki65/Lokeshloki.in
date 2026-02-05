import { db, analytics } from "./firebase-config.js";
import { doc, setDoc, updateDoc, serverTimestamp, increment, arrayUnion } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- Utility: Generate UUID ---
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// --- 1. Visitor Identification ---
let visitorId = localStorage.getItem('visitorId');
if (!visitorId) {
    visitorId = generateUUID();
    localStorage.setItem('visitorId', visitorId);
}

// --- 2. Advanced Device & OS Detection ---
const getSystemInfo = () => {
    const ua = navigator.userAgent;
    let os = "Unknown OS";
    let device = "Desktop";

    // OS Detection
    if (ua.indexOf("Win") !== -1) os = "Windows";
    if (ua.indexOf("Mac") !== -1) os = "MacOS";
    if (ua.indexOf("Linux") !== -1) os = "Linux";
    if (ua.indexOf("Android") !== -1) { os = "Android"; device = "Mobile"; }
    if (ua.indexOf("like Mac") !== -1) { os = "iOS"; device = "Mobile"; }

    // Windows Version Check
    if (os === "Windows") {
        if (/Windows NT 10.0/.test(ua)) os = "Windows 10/11";
        if (/Windows NT 6.3/.test(ua)) os = "Windows 8.1";
        if (/Windows NT 6.2/.test(ua)) os = "Windows 8";
        if (/Windows NT 6.1/.test(ua)) os = "Windows 7";
    }

    // Browser Detection
    let browser = "Unknown";
    if (ua.indexOf("Firefox") > -1) browser = "Firefox";
    else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Internet";
    else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera";
    else if (ua.indexOf("Trident") > -1) browser = "Internet Explorer";
    else if (ua.indexOf("Edge") > -1) browser = "Edge";
    else if (ua.indexOf("Chrome") > -1) browser = "Chrome";
    else if (ua.indexOf("Safari") > -1) browser = "Safari";

    return { os, device, browser };
    // GPU/Renderer Detection (to guess model like 'iPhone 13' vs 'iPhone 11' if possible, mostly just 'Apple GPU')
    let renderer = "Unknown GPU";
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
            }
        }
    } catch (e) { }

    return { os, device, browser, renderer };
};

// --- 3. Geo Location (Free API) ---
async function getIpInfo() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        return await response.json(); // Returns { ip, city, region, country_name, latitude, longitude, org }
    } catch (e) {
        console.warn("Failed to fetch IP info", e);
        return { country_name: 'Unknown', city: 'Unknown', ip: 'Unknown', latitude: 0, longitude: 0 };
    }
}

// --- 4. Main Tracking Function ---
async function initTracking() {
    const ipInfo = await getIpInfo();
    const sysInfo = getSystemInfo();
    const screenRes = `${window.screen.width}x${window.screen.height}`;

    const visitorRef = doc(db, "analytics", "visitors", "list", visitorId);

    // Initial Visitor Log
    const visitorData = {
        visitorId: visitorId,
        ip: ipInfo.ip || 'Unknown',
        country: ipInfo.country_name || 'Unknown',
        city: ipInfo.city || 'Unknown',
        device: sysInfo.device,
        os: sysInfo.os,
        browser: sysInfo.browser,
        renderer: sysInfo.renderer || 'Unknown',
        lat: ipInfo.latitude || 0,
        lon: ipInfo.longitude || 0,
        screen: screenRes,
        lastActive: serverTimestamp(),
        online: true,
        // Using setDoc with merge: true to avoid overwriting "firstVisit" if it exists
    };

    // We only set firstVisit if it's a new document/first time
    // But since we can't easily check 'exists' without a read (which saves quota), 
    // we'll just set it. If we want to be strict about "First Visit Time", we can use a local flag.
    if (!localStorage.getItem('visitedBefore')) {
        visitorData.firstVisit = serverTimestamp();
        localStorage.setItem('visitedBefore', 'true');
    }

    try {
        await setDoc(visitorRef, visitorData, { merge: true });
        // Update stats aggregate
        const statsRef = doc(db, "analytics", "stats");
        await updateDoc(statsRef, {
            totalVisitors: increment(1)
        }).catch(async (err) => {
            // If stats doc doesn't exist, create it
            if (err.code === 'not-found') await setDoc(statsRef, { totalVisitors: 1 });
        });

        console.log("Visitor tracked:", visitorId);
    } catch (e) {
        console.error("Tracking Error:", e);
    }

    // --- Heartbeat for "Online" Status (Every 10s - Faster Heartbeat) ---
    // Increased frequency for better resolution
    setInterval(() => {
        if (document.visibilityState === 'visible') {
            updateDoc(visitorRef, {
                lastActive: serverTimestamp(),
                online: true
            });
        }
    }, 10000);

    // --- Reliability: Optimize for "Instant" Offline on Close ---
    const setOffline = () => {
        // Beacon API cannot be easily used with Firestore directly without a cloud function.
        // We attempt a standard write, which works if the network thread stays alive long enough.
        // On mobile, 'pagehide' is the standard.
        // We also set 'online: false' immediately.
        updateDoc(visitorRef, {
            online: false,
            lastActive: serverTimestamp()
        }).catch(e => console.error("Offline update failed", e));
    };

    // 'pagehide' is more reliable than 'beforeunload' on modern browsers/mobile
    window.addEventListener('pagehide', setOffline);
    window.addEventListener('beforeunload', setOffline);

    // Optional: Mark as "Away" when switching tabs
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            updateDoc(visitorRef, { online: false });
        } else {
            updateDoc(visitorRef, { online: true, lastActive: serverTimestamp() });
        }
    });
}

// --- 5. Page Time Tracking (Section based) ---
function initPageTimeTracking() {
    let currentSection = 'home';
    let sectionStartTime = Date.now();

    // Observer for sections
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && entry.intersectionRatio > 0.5) {
                const newSection = entry.target.id;
                if (newSection !== currentSection) {
                    // Log time for previous section
                    const timeSpent = (Date.now() - sectionStartTime) / 1000; // seconds
                    logPageTime(currentSection, timeSpent);

                    // Reset
                    currentSection = newSection;
                    sectionStartTime = Date.now();
                }
            }
        });
    }, { threshold: 0.5 });

    document.querySelectorAll('section').forEach(section => {
        observer.observe(section);
    });
}

async function logPageTime(pageName, seconds) {
    if (seconds < 1) return; // Ignore quick scrolls
    const visitorRef = doc(db, "analytics", "visitors", "list", visitorId);

    try {
        // Store page views as an object map in the visitor doc: pages: { home: 120, about: 50 }
        // Note: Firestore field paths with variables need specific handling or aggregation
        // Simpler approach: update a dedicated subcollection or just an array of logs

        // For this requirement: "Time stayed on each page" - let's Aggregate in the visitor doc
        // We need to read first to increment locally or use map updates (dot notation)

        const updateField = `pageTimes.${pageName}`;
        await updateDoc(visitorRef, {
            [updateField]: increment(seconds)
        });

        // Also update global aggregate for that page
        const globalPageRef = doc(db, "analytics", "pages");
        await updateDoc(globalPageRef, {
            [pageName]: increment(seconds),
            [`${pageName}_views`]: increment(1)
        }).catch(async (e) => {
            if (e.code === 'not-found') await setDoc(globalPageRef, { [pageName]: seconds, [`${pageName}_views`]: 1 });
        });

    } catch (e) {
        console.error("Page Log Error", e);
    }
}

// Start
initTracking();
// Wait for DOM
document.addEventListener('DOMContentLoaded', initPageTimeTracking);
