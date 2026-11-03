// OutpostBuilder docs - mobile sidebar toggle. No framework, no dependencies.
(function () {
  var toggle = document.getElementById('nav-toggle');
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('nav-scrim');
  if (!toggle || !sidebar) return;

  function setOpen(open) {
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  toggle.addEventListener('click', function () {
    setOpen(!document.body.classList.contains('nav-open'));
  });

  if (scrim) {
    scrim.addEventListener('click', function () { setOpen(false); });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setOpen(false);
  });

  // Close the drawer if a nav link is used (covers same-page anchor navigation).
  sidebar.addEventListener('click', function (e) {
    if (e.target.closest('a')) setOpen(false);
  });
})();
