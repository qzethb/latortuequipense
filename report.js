
const form = document.getElementById("report-form");
const status = document.getElementById("report-status");
const button = document.getElementById("submit-button");

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const message = document.getElementById("message").value.trim();
  const category = document.getElementById("category").value;

  if (!message) {
    status.textContent = "Merci de décrire le problème.";
    return;
  }

  button.disabled = true;
  status.textContent = "Envoi en cours...";

  try {
    const response = await fetch(
      "https://formsubmit.app/f/yrwzty2rxq",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          category: category,
          message: message,
          _subject: "Nouveau signalement - La Tortue",
          _gotcha: "",
          _ts: Date.now()
        })
      }
    );

    const result = await response.json();

    if (!response.ok || result.ok !== true) {
      throw new Error("Échec de l'envoi");
    }

    form.reset();
    status.textContent =
      "Merci ! Ton signalement a bien été envoyé.";

  } catch (error) {
    status.textContent =
      "L'envoi a échoué. Réessaie dans quelques instants.";
  } finally {
    button.disabled = false;
  }
});
