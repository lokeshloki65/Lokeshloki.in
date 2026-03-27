import { db } from "./firebase-config.js";
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"; 

function initCMS() {   
    console.log("Initializing CMS listeners...");
 
    onSnapshot(doc(db, "cms", "home"), (doc) => {  
        if (doc.exists()) {   
            const data = doc.data();
            if (data.title) { 
                const titleEl = document.getElementById('home-title');
                if (titleEl) titleEl.innerHTML = data.title;  
            }
            if (data.subtitle) {
                const subEl = document.getElementById('home-subtitle');
                if (subEl) subEl.innerHTML = data.subtitle;
            }
            if (data.description) {
                const descEl = document.getElementById('home-desc');
                if (descEl) descEl.innerText = data.description;
            }
        }
    });

    // 1. Listen for 'About' section updates
    const aboutDoc = doc(db, "cms", "about");
    onSnapshot(aboutDoc, (doc) => {
        if (doc.exists()) {
            const data = doc.data();
            const aboutEl = document.getElementById('about-text');
            if (aboutEl) aboutEl.innerHTML = data.content || ''; // Use innerHTML to allow basic formatting if needed
        }
    });

    // 2. Listen for 'Skills' updates
    const skillsCol = collection(db, "cms", "skills");
    onSnapshot(skillsCol, (snapshot) => {
        const skillsContainer = document.getElementById('skills-list');
        if (!skillsContainer) return;

        skillsContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const skill = doc.data();
            // Create proper markup for existing design (simulated)
            const skillEl = document.createElement('div');
            skillEl.className = 'skill-card';
            skillEl.innerHTML = `
                <i class="${skill.icon || 'fas fa-code'}"></i>
                <h3>${skill.name}</h3>
                <p>${skill.level || 'Intermediate'}</p>
            `;
            skillsContainer.appendChild(skillEl);
        });
    });

    // 3. Listen for 'Projects' updates
    const projectsCol = collection(db, "cms", "projects");
    onSnapshot(projectsCol, (snapshot) => {
        const projectsContainer = document.getElementById('projects-grid');
        if (!projectsContainer) return;

        projectsContainer.innerHTML = '';
        snapshot.forEach(doc => {
            const project = doc.data();
            const projectCard = document.createElement('div');
            projectCard.className = 'project-card';
            projectCard.innerHTML = `
                <img src="${project.imageUrl || 'https://via.placeholder.com/300'}" alt="${project.title}">
                <div class="project-info">
                    <h3>${project.title}</h3>
                    <p>${project.description}</p>
                    <div class="links">
                        <a href="${project.githubLink}" target="_blank">GitHub</a>
                        <a href="${project.liveLink}" target="_blank">Live Demo</a>
                    </div>
                </div>
            `;
            projectsContainer.appendChild(projectCard);
        });
    });

    // 4. Listen for 'Certificates' updates
    const certsCol = collection(db, "cms", "certificates");
    onSnapshot(certsCol, (snapshot) => {
        const certsContainer = document.getElementById('featured-certs-grid'); // Using existing ID
        if (!certsContainer) return;

        // We might want to keep the original static content if no dynamic data?
        // For now, let's prepend or replace. To be safe, if we have dynamic data, we use it.
        if (!snapshot.empty) {
            certsContainer.innerHTML = '';
            snapshot.forEach(doc => {
                const c = doc.data();
                const div = document.createElement('div');
                div.className = 'cert-card';
                div.setAttribute('data-aos', 'fade-up');
                div.innerHTML = `
                    <div class="cert-img-box">
                        <img src="${c.img}" alt="${c.title}">
                        <div class="cert-overlay">
                            <i class="fas fa-search-plus" onclick="openCertLightbox('${c.img}')"></i>
                        </div>
                    </div>
                    <div class="cert-info">
                        <h3>${c.title}</h3>
                        <p>${c.issuer}</p>
                    </div>
                `;
                // Note: The openCertLightbox needs to handle URL string or index. 
                // Creating a specific click handler might be better but reusing existing global for simplicity.
                // We'll modify the lightbox logic if needed, but for now passing URL to a new handler if needed.
                // Actually the existing one expects Index. Let's make a simple inline onclick workaround or assume user modifies lightbox.
                // For safety: Remove the onclick and use addEventListener if we were strict, but let's stick to simple structure.
                div.querySelector('.fa-search-plus').onclick = () => {
                    const lightbox = document.getElementById("cert-lightbox");
                    const img = document.getElementById("lightboxImage");
                    if (lightbox && img) {
                        lightbox.style.display = "flex";
                        img.src = c.img;
                    }
                };
                certsContainer.appendChild(div);
            });
        }
    });

    // 5. Listen for Config (Section Visibility)
    onSnapshot(doc(db, "cms", "config"), (doc) => {
        if (doc.exists()) {
            const d = doc.data();
            const setDisplay = (id, show) => {
                const el = document.getElementById(id);
                if (el) el.style.display = (show !== false) ? 'block' : 'none';
            };
            setDisplay('tech-stats', d.showStats);
            setDisplay('timeline-section', d.showTimeline);
            setDisplay('certifications', d.showCerts);
        }
    });

    initContactForm();
}

function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopImmediatePropagation(); // Stop other scripts from interfering

        const btn = form.querySelector('button');
        const originalText = btn.innerText;
        btn.innerHTML = 'Sending... <i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true;

        const name = form.querySelector('input[name="name"]').value;
        const email = form.querySelector('input[name="email"]').value;
        const message = form.querySelector('textarea[name="message"]').value;

        let firebaseSuccess = false;
        let formspreeSuccess = false;

        // 1. Send to Firebase (Admin Dashboard)
        try {
            await addDoc(collection(db, "messages"), {
                name, email, message,
                timestamp: serverTimestamp()
            });
            firebaseSuccess = true;
        } catch (error) {
            console.error("Firebase sending error", error);
        }

        // 2. Send to Formspree (Email)
        try {
            const response = await fetch("https://formspree.io/f/xnjaveww", {
                method: "POST",
                body: new FormData(form),
                headers: { 'Accept': 'application/json' }
            });
            if (response.ok) formspreeSuccess = true;
            else console.error("Formspree error", await response.text());
        } catch (error) {
            console.error("Formspree network error", error);
        }

        // 3. Handle Result
        if (firebaseSuccess && formspreeSuccess) {
            alert("Message Sent! (Saved to Admin & Emailed)");
            form.reset();
        } else if (firebaseSuccess) {
            alert("Message Saved to Admin Dashboard (Email failed)");
            form.reset();
        } else if (formspreeSuccess) {
            alert("Message Emailed (Admin save failed)");
            form.reset();
        } else {
            alert("Failed to send message. Please try again.");
        }

        btn.innerText = originalText;
        btn.disabled = false;
    });
}

document.addEventListener('DOMContentLoaded', initCMS);
