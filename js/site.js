// ============================================================
// Config
// ============================================================
const CONTENT_PATH = './content';

// ============================================================
// Utilities
// ============================================================
async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

function escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ============================================================
// Routing
// ============================================================
function getSlug() {
  return location.hash.replace(/^#\/?/, '') || 'about';
}

async function loadPage(site) {
  const slug = getSlug();
  const main = document.getElementById('page-content');

  // Update active nav link
  document.querySelectorAll('#nav-links a').forEach(a => {
    a.classList.toggle('active', a.dataset.page === slug);
  });

  main.innerHTML = '<div class="loading">Loading...</div>';

  try {
    const page = await fetchJSON(`${CONTENT_PATH}/pages/${slug}.json`);
    const renderer = renderers[page.type];
    if (!renderer) throw new Error(`Unknown page type: "${page.type}"`);
    main.innerHTML = renderer(page);
    document.title = page.title ? `${page.title} — ${site.title}` : site.title;
  } catch (err) {
    main.innerHTML = `<div class="error-page"><h2>Page not found</h2><p>Could not load <code>${escape(slug)}</code>.</p></div>`;
    console.error(err);
  }
}

// ============================================================
// Nav rendering
// ============================================================
function renderNav(site) {
  document.getElementById('site-title').textContent = site.title;

  document.getElementById('nav-links').innerHTML = site.nav
    .map(item => `<li><a href="#${item.page}" data-page="${escape(item.page)}">${escape(item.label)}</a></li>`)
    .join('');

  const socialHTML = site.social
    .map(s => `<a href="${escape(s.url)}" target="_blank" rel="noopener" class="social-link social-${escape(s.icon)}" title="${escape(s.label)}">${escape(s.label)}</a>`)
    .join('');

  const emailHTML = (site.email_user && site.email_domain)
    ? `<span class="nav-email obf-email" data-u="${escape(site.email_user)}" data-d="${escape(site.email_domain)}" title="click to reveal">[email]</span>`
    : site.email ? `<span class="nav-email">${escape(site.email)}</span>` : '';

  document.getElementById('nav-social').innerHTML = `
    <div class="social-links">${socialHTML}</div>
    ${emailHTML}
  `;
}

// ============================================================
// Page Renderers
// ============================================================
const renderers = { about: renderAbout, portfolio: renderPortfolio, resume: renderResume };

function renderAbout(page) {
  const photoHTML = page.photo
    ? `<img src="${escape(page.photo)}" alt="${escape(page.name)}" class="profile-photo">`
    : '';

  const bioHTML = (page.bio || []).map(p => `<p>${p}</p>`).join('');

  const statsHTML = (page.stats || []).length ? `
    <div class="about-stats">
      ${page.stats.map(s => `
        <div class="stat-row">
          <span class="stat-label">${escape(s.label)}</span>
          <span class="stat-value">${escape(s.value)}</span>
        </div>`).join('')}
    </div>` : '';

  const skillsHTML = (page.skills || []).length ? `
    <div class="about-section">
      <h2>Skills</h2>
      <div class="skills-tags">
        ${page.skills.map(s => `<span class="tag">${escape(s)}</span>`).join('')}
      </div>
    </div>` : '';

  const highlightsHTML = (page.highlights || []).length ? `
    <div class="about-section">
      <h2>Featured Work</h2>
      <div class="highlight-grid">
        ${page.highlights.map(h => `
          <a href="${escape(h.href)}" class="highlight-card">
            <div class="highlight-header">
              <span class="highlight-title">${escape(h.title)}</span>
              <span class="highlight-context">${escape(h.context)}</span>
            </div>
            <p>${escape(h.description)}</p>
          </a>`).join('')}
      </div>
    </div>` : '';

  const ctaHTML = (page.cta || []).length ? `
    <div class="about-cta">
      ${page.cta.map(c => `<a href="${escape(c.href)}" class="btn-cta${c.primary ? ' btn-cta-primary' : ''}">${escape(c.label)}</a>`).join('')}
    </div>` : '';

  return `
    <div class="about-page">
      <div class="hero">
        ${photoHTML}
        <div class="hero-text">
          <h1>${escape(page.name)}</h1>
          <p class="headline">${escape(page.headline)}</p>
        </div>
      </div>
      <div class="bio">${bioHTML}</div>
      ${statsHTML}
      ${skillsHTML}
      ${highlightsHTML}
      ${ctaHTML}
    </div>
  `;
}

function renderPortfolio(page) {
  const projects = page.projects || [];
  const featured = projects.filter(p => p.featured);
  const others   = projects.filter(p => !p.featured);

  const featuredHTML = featured.map(p => {
    const tags = [...(p.platforms || []), ...(p.tech || [])];
    const tagsHTML = tags.length
      ? `<div class="project-tags">${tags.map(t => `<span class="tag">${escape(t)}</span>`).join('')}</div>`
      : '';
    const linksHTML = (p.links || []).length
      ? `<div class="project-links">${p.links.map(l => `<a href="${escape(l.url)}" target="_blank" rel="noopener">${escape(l.label)}</a>`).join('')}</div>`
      : '';
    const imageHTML = p.image
      ? `<div class="card-image"><img src="${escape(p.image)}" alt="${escape(p.title)}" loading="lazy"></div>`
      : '';
    const badgeHTML = p.unreleased ? `<span class="badge-unreleased">unreleased</span>` : '';
    const subprojectsHTML = (p.subprojects || []).length ? `
      <div class="subprojects">
        ${p.subprojects.map(s => `
          <div class="subproject">
            <div class="subproject-header">
              <span class="subproject-title">${escape(s.title)}</span>
              ${s.period ? `<span class="subproject-period">${escape(s.period)}</span>` : ''}
            </div>
            <p>${escape(s.description)}</p>
          </div>
        `).join('')}
      </div>` : '';
    return `
      <div class="project-card project-card-featured">
        ${imageHTML}
        <div class="project-body">
          <div class="project-header">
            <h3>${escape(p.title)}${badgeHTML}</h3>
            ${p.company ? `<span class="project-company">${escape(p.company)}</span>` : ''}
            ${p.year ? `<span class="project-year">${escape(p.year)}</span>` : ''}
          </div>
          ${tagsHTML}
          <p class="project-summary">${escape(p.description)}</p>
          ${subprojectsHTML}
          ${linksHTML}
        </div>
      </div>
    `;
  }).join('');

  const othersHTML = others.map(p => {
    const tags = [...(p.platforms || []), ...(p.tech || [])];
    const tagsHTML = tags.length
      ? `<div class="project-tags">${tags.map(t => `<span class="tag">${escape(t)}</span>`).join('')}</div>`
      : '';
    const linksHTML = (p.links || []).length
      ? `<div class="project-links">${p.links.map(l => `<a href="${escape(l.url)}" target="_blank" rel="noopener">${escape(l.label)}</a>`).join('')}</div>`
      : '';
    const badgeHTML = p.unreleased ? `<span class="badge-unreleased">unreleased</span>` : '';
    const imageHTML = p.image
      ? `<div class="card-image-small"><img src="${escape(p.image)}" alt="${escape(p.title)}" loading="lazy"></div>`
      : '';
    return `
      <div class="project-card">
        ${imageHTML}
        <div class="project-card-content">
          <div class="project-header">
            <h3>${escape(p.title)}${badgeHTML}</h3>
            ${p.company ? `<span class="project-company">${escape(p.company)}</span>` : ''}
            ${p.year ? `<span class="project-year">${escape(p.year)}</span>` : ''}
          </div>
          ${tagsHTML}
          <p>${escape(p.description)}</p>
          ${linksHTML}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="portfolio-page">
      <h1>${escape(page.title)}</h1>
      <div class="featured-grid">${featuredHTML}</div>
      ${others.length ? `
        <h2 class="other-projects-heading">// Other Projects</h2>
        <div class="project-grid">${othersHTML}</div>
      ` : ''}
    </div>
  `;
}

function renderResume(page) {
  const r = page.data;

  const contactParts = [];
  if (r.contact.email_user && r.contact.email_domain) {
    contactParts.push(`<span class="obf-email" data-u="${escape(r.contact.email_user)}" data-d="${escape(r.contact.email_domain)}" title="click to reveal">[click to reveal email]</span>`);
  } else if (r.contact.email) {
    contactParts.push(`<span><a href="mailto:${escape(r.contact.email)}">${escape(r.contact.email)}</a></span>`);
  }
  if (r.contact.location) contactParts.push(`<span>${escape(r.contact.location)}</span>`);
  if (r.contact.website)  contactParts.push(`<span><a href="${escape(r.contact.website)}" target="_blank" rel="noopener">${escape(r.contact.website)}</a></span>`);

  const skillsHTML = (r.skills || []).map(s => `
    <div class="skill-row">
      <span class="skill-category">${escape(s.category)}</span>
      <span class="skill-items">${s.items.map(escape).join(', ')}</span>
    </div>
  `).join('');

  const expHTML   = (r.experience || []).map(renderJob).join('');
  const addExpHTML = r.additional_experience
    ? `<section class="resume-section"><h2>Additional Experience</h2>${r.additional_experience.map(renderJob).join('')}</section>`
    : '';

  const eduHTML = (r.education || []).map(edu => `
    <div class="edu-entry">
      <div class="entry-meta">
        <div class="entry-left">
          <strong class="company-name">${escape(edu.school)}</strong>
          <span class="job-title">${escape(edu.degree)}, ${escape(edu.field)}</span>
        </div>
        <span class="entry-dates">${escape(edu.start)} – ${escape(edu.end)}</span>
      </div>
      ${edu.additional ? `<div class="entry-additional">${escape(edu.additional)}</div>` : ''}
    </div>
  `).join('');

  return `
    <div class="resume-page">
      <div class="resume-header">
        <h1>${escape(r.name)}</h1>
        <p class="resume-headline">${escape(r.headline)}</p>
        <div class="resume-contact">${contactParts.join('')}</div>
      </div>

      <section class="resume-section">
        <h2>Experience</h2>
        ${expHTML}
      </section>

      <section class="resume-section resume-section-break">
        <h2>Technical Skills</h2>
        <div class="skills-grid">${skillsHTML}</div>
      </section>

      ${addExpHTML}

      <section class="resume-section">
        <h2>Education</h2>
        ${eduHTML}
      </section>

      ${r.objective ? `<section class="resume-section resume-hide-print"><h2>Objective</h2><p>${r.objective}</p></section>` : ''}
      ${r.interests ? `<section class="resume-section resume-hide-print"><h2>Interests</h2><p>${r.interests}</p></section>` : ''}

      <div class="resume-actions">
        <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
      </div>
    </div>
  `;
}

function renderJob(job) {
  const bulletsHTML = (job.bullets || []).length
    ? `<ul class="job-bullets">${job.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`
    : '';

  const projectsHTML = (job.projects || []).map(p => {
    const label = [
      `<strong>${escape(p.name)}</strong>`,
      p.platform ? `<em>(${escape(p.platform)})</em>` : '',
      p.type ? `<span class="project-type"> · ${escape(p.type)}</span>` : '',
    ].filter(Boolean).join(' ');

    const teamsHTML = (p.teams || []).map(t => `
      <div class="sub-team">
        ${t.name ? `<span class="team-name">${escape(t.name)}</span>` : ''}
        <ul>${(t.bullets || []).map(b => `<li>${b}</li>`).join('')}</ul>
      </div>
    `).join('');

    const pbulletsHTML = (p.bullets || []).length
      ? `<ul>${p.bullets.map(b => `<li>${b}</li>`).join('')}</ul>`
      : '';

    return `<li><span class="project-label">${label}</span>${teamsHTML}${pbulletsHTML}</li>`;
  }).join('');

  return `
    <div class="job-entry">
      <div class="entry-meta">
        <div class="entry-left">
          <strong class="company-name">${escape(job.company)}</strong>
          <span class="job-title">${escape(job.title)}</span>
        </div>
        <span class="entry-dates">${escape(job.start)} – ${escape(job.end)}</span>
      </div>
      ${bulletsHTML}
      ${projectsHTML ? `<ul class="project-list">${projectsHTML}</ul>` : ''}
    </div>
  `;
}

// ============================================================
// Boot
// ============================================================
async function init() {
  // Mobile nav toggle
  document.getElementById('nav-toggle').addEventListener('click', () => {
    document.getElementById('site-nav').classList.toggle('nav-open');
  });

  // Close mobile nav on link click
  document.getElementById('nav-links').addEventListener('click', () => {
    document.getElementById('site-nav').classList.remove('nav-open');
  });

  // Email obfuscation — reveal on click (covers both nav and page content)
  document.addEventListener('click', e => {
    const el = e.target.closest('.obf-email');
    if (!el) return;
    const email = el.dataset.u + '@' + el.dataset.d;
    el.outerHTML = `<span><a href="mailto:${email}">${email}</a></span>`;
  });

  try {
    const site = await fetchJSON(`${CONTENT_PATH}/site.json`);
    renderNav(site);
    window.addEventListener('hashchange', () => loadPage(site));
    loadPage(site);
  } catch (err) {
    document.getElementById('page-content').innerHTML =
      '<div class="error-page"><p>Failed to load site configuration.</p></div>';
    console.error(err);
  }
}

init();
