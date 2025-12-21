import { db } from "./firebase-config.js";
import { doc, onSnapshot, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function initCMS() {
    console.log("Initializing CMS listeners...");

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
    initContactForm();
}

function initContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        const originalText = btn.innerText;
        btn.innerText = "Sending...";
        btn.disabled = true;

        const name = form.querySelector('input[type="text"]').value;
        const email = form.querySelector('input[type="email"]').value;
        const message = form.querySelector('textarea').value;

        try {
            await addDoc(collection(db, "messages"), {
                name, email, message,
                timestamp: serverTimestamp()
            });
            alert("Message Sent Successfully!");
            form.reset();
        } catch (error) {
            console.error("Error sending message", error);
            alert("Failed to send message: " + error.message);
        }
        btn.innerText = originalText;
        btn.disabled = false;
    });
}

document.addEventListener('DOMContentLoaded', initCMS);
