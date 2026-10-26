(function () {
  document.querySelectorAll('article figure img[alt]:not([alt=""])').forEach(function (image) {
    var figure = image.closest('figure');
    var details = document.createElement('details');
    var summary = document.createElement('summary');
    var description = document.createElement('p');

    details.className = 'description-schema';
    summary.textContent = 'Description détaillée';
    description.textContent = image.alt;
    details.append(summary, description);
    figure.append(details);
  });
})();
