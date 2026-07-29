document.addEventListener("DOMContentLoaded", () => {
    // Reveal Stagger Animation using Intersection Observer
    // Matches the taste-skill standard for lightweight reveal on scroll
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
                    // Add a slight delay based on index if multiple elements appear at once
                    setTimeout(() => {
                        entry.target.classList.add('is-visible');
                    }, index * 100);
                    
                    // Stop observing once revealed
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        revealElements.forEach(el => {
            revealObserver.observe(el);
        });
    }

    // Force hero to reveal immediately without scroll
    const hero = document.querySelector('.hero');
    if (hero) {
        setTimeout(() => {
            hero.classList.add('is-visible');
        }, 100);
    }
});
