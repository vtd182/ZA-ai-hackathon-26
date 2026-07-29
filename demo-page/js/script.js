document.addEventListener("DOMContentLoaded", () => {
    // 1. Reveal Stagger Animation
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    if (revealElements.length > 0) {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.15
        };
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry, index) => {
                if (entry.isIntersecting) {
                    setTimeout(() => {
                        entry.target.classList.add('is-visible');
                    }, index * 100);
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);
        revealElements.forEach(el => revealObserver.observe(el));
    }
    const hero = document.querySelector('.hero');
    if (hero) setTimeout(() => hero.classList.add('is-visible'), 100);

    const articleHeader = document.querySelector('.article-header');
    if (articleHeader) setTimeout(() => articleHeader.classList.add('is-visible'), 100);

    // 2. Theme Toggle
    const themeToggleBtn = document.getElementById('theme-toggle');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    let currentTheme = localStorage.getItem('theme') || (prefersDark ? 'dark' : 'light');
    
    const applyTheme = (theme) => {
        document.documentElement.setAttribute('data-theme', theme);
        if (themeToggleBtn) {
            themeToggleBtn.innerHTML = theme === 'dark' ? '☀️' : '🌙';
        }
        
        // Re-initialize mermaid if it exists, to match theme
        if (window.mermaid) {
            mermaid.initialize({
                startOnLoad: true,
                theme: theme === 'dark' ? 'dark' : 'default'
            });
            // Force re-render of mermaid diagrams
            const mermaidElements = document.querySelectorAll('.mermaid');
            mermaidElements.forEach(el => {
                const originalContent = el.getAttribute('data-original');
                if (originalContent) {
                    el.innerHTML = originalContent;
                    el.removeAttribute('data-processed');
                }
            });
            if (mermaidElements.length > 0) {
                mermaid.init(undefined, document.querySelectorAll('.mermaid'));
            }
        }
    };
    applyTheme(currentTheme);

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            currentTheme = currentTheme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('theme', currentTheme);
            applyTheme(currentTheme);
        });
    }

    // 3. Language Toggle
    const langToggleBtn = document.getElementById('lang-toggle');
    let currentLang = localStorage.getItem('lang') || 'vi'; // default to Vietnamese
    
    const applyLang = (lang) => {
        document.documentElement.setAttribute('data-lang', lang);
        if (langToggleBtn) {
            langToggleBtn.innerHTML = lang === 'en' ? '🇻🇳 VI' : '🇺🇸 EN';
        }
    };
    applyLang(currentLang);

    if (langToggleBtn) {
        langToggleBtn.addEventListener('click', () => {
            currentLang = currentLang === 'en' ? 'vi' : 'en';
            localStorage.setItem('lang', currentLang);
            applyLang(currentLang);
        });
    }
});
