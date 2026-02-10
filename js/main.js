/* ============================================
   Navigation
   ============================================ */
const nav = document.getElementById('nav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
const navItems = document.querySelectorAll('.nav__link');

// Scroll shadow
window.addEventListener('scroll', () => {
  nav.classList.toggle('nav--scrolled', window.scrollY > 50);
});

// Mobile toggle
navToggle.addEventListener('click', () => {
  navToggle.classList.toggle('open');
  navLinks.classList.toggle('open');
});

// Close menu on link click
navItems.forEach(link => {
  link.addEventListener('click', () => {
    navToggle.classList.remove('open');
    navLinks.classList.remove('open');
  });
});

/* ============================================
   Active Link Highlighting
   ============================================ */
const sections = document.querySelectorAll('section[id]');

function highlightNav() {
  const scrollY = window.scrollY + 120;

  sections.forEach(section => {
    const top = section.offsetTop;
    const height = section.offsetHeight;
    const id = section.getAttribute('id');
    const link = document.querySelector(`.nav__link[href="#${id}"]`);

    if (link) {
      if (scrollY >= top && scrollY < top + height) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    }
  });
}

window.addEventListener('scroll', highlightNav);

/* ============================================
   Project Filter
   ============================================ */
const filterBtns = document.querySelectorAll('.filter-btn');
const cards = document.querySelectorAll('.card[data-category]');

filterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    // Update active button
    filterBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    const filter = btn.dataset.filter;

    cards.forEach(card => {
      if (filter === 'all' || card.dataset.category === filter) {
        card.classList.remove('hidden');
      } else {
        card.classList.add('hidden');
      }
    });
  });
});

/* ============================================
   Scroll Reveal (Intersection Observer)
   ============================================ */
const revealElements = document.querySelectorAll('.reveal');

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.15,
  rootMargin: '0px 0px -40px 0px'
});

revealElements.forEach(el => revealObserver.observe(el));

/* ============================================
   Contact Form Validation
   ============================================ */
const form = document.getElementById('contactForm');
const nameInput = document.getElementById('name');
const emailInput = document.getElementById('email');
const messageInput = document.getElementById('message');
const nameError = document.getElementById('nameError');
const emailError = document.getElementById('emailError');
const messageError = document.getElementById('messageError');
const formSuccess = document.getElementById('formSuccess');

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function clearErrors() {
  [nameInput, emailInput, messageInput].forEach(el => el.classList.remove('error'));
  [nameError, emailError, messageError].forEach(el => el.textContent = '');
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  clearErrors();
  formSuccess.classList.remove('visible');

  let valid = true;

  if (!nameInput.value.trim()) {
    nameInput.classList.add('error');
    nameError.textContent = 'Please enter your name.';
    valid = false;
  }

  if (!emailInput.value.trim()) {
    emailInput.classList.add('error');
    emailError.textContent = 'Please enter your email.';
    valid = false;
  } else if (!validateEmail(emailInput.value.trim())) {
    emailInput.classList.add('error');
    emailError.textContent = 'Please enter a valid email address.';
    valid = false;
  }

  if (!messageInput.value.trim()) {
    messageInput.classList.add('error');
    messageError.textContent = 'Please enter a message.';
    valid = false;
  }

  if (valid) {
    formSuccess.classList.add('visible');
    form.reset();
  }
});
