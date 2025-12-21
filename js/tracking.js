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

// --- 2. Device & Browser Detection ---
const getDeviceType = () => {
    const ua = navigator.userAgent;
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
        return "tablet";
    }
    else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
        return "mobile";
    }
    return "desktop";
};

const getBrowserName = () => {
    const agent = navigator.userAgent.toLowerCase();
    switch (true) {
        case agent.indexOf("edge") > -1: return "edge";
        case agent.indexOf("opr") > -1: return "opera";
        case agent.indexOf("chrome") > -1: return "chrome";
        case agent.indexOf("trident") > -1: return "ie";
        case agent.indexOf("firefox") > -1: return "firefox";
        case agent.indexOf("safari") > -1: return "safari";
        default: return "other";
    }
};

// --- 3. Geo Location (Free API) ---
async function getIpInfo() {
    try {
        const response = await fetch('https://ipapi.co/json/');
        return await response.json();
    } catch (e) {
        console.warn("Failed to fetch IP info", e);
        return { country_name: 'Unknown', city: 'Unknown', ip: 'Unknown' };
    }
}

// --- 4. Main Tracking Function ---
async function initTracking() {
    const ipInfo = await getIpInfo();
    const deviceType = getDeviceType();
    const browserName = getBrowserName();
    const screenRes = `${window.screen.width}x${window.screen.height}`;

    const visitorRef = doc(db, "analytics", "visitors", "list", visitorId);

    // Initial Visitor Log
    const visitorData = {
        visitorId: visitorId,
        ip: ipInfo.ip || 'Unknown',
        country: ipInfo.country_name || 'Unknown',
        city: ipInfo.city || 'Unknown',
        device: deviceType,
        browser: browserName,
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

    // --- Heartbeat for "Online" Status (Every 30s) ---
    setInterval(() => {
        updateDoc(visitorRef, {
            lastActive: serverTimestamp(),
            online: true
        });
    }, 30000);

    // Cleanup on close
    window.addEventListener('beforeunload', () => {
        // Beacon API is better for close events as they might not finish async calls
        const data = new Blob([JSON.stringify({ online: false })], { type: 'application/json' });
        navigator.sendBeacon('/api/close-tracking', data); // Note: pure Client-side Firestore can't easily use Beacon API directly to Firestore URL. 
        // We will try a best-effort update
        updateDoc(visitorRef, { online: false });
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
