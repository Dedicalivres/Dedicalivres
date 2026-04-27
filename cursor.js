const cursor = document.querySelector(".custom-cursor");
let mouseX = 0, mouseY = 0, cursorX = 0, cursorY = 0, lastTrail = 0;

if (window.innerWidth > 768 && cursor) {
  document.addEventListener("mousemove", (event) => {
    mouseX = event.clientX;
    mouseY = event.clientY;

    const now = Date.now();
    if (now - lastTrail > 55) {
      const book = document.createElement("span");
      book.className = "book-trail";
      book.style.left = `${mouseX + (Math.random() - 0.5) * 14}px`;
      book.style.top = `${mouseY + (Math.random() - 0.5) * 14}px`;
      book.style.setProperty("--rotation", `${(Math.random() - 0.5) * 22}deg`);
      document.body.appendChild(book);
      setTimeout(() => book.remove(), 700);
      lastTrail = now;
    }
  });

  function animateCursor() {
    cursorX += (mouseX - cursorX) * 0.22;
    cursorY += (mouseY - cursorY) * 0.22;
    cursor.style.left = `${cursorX}px`;
    cursor.style.top = `${cursorY}px`;
    requestAnimationFrame(animateCursor);
  }
  animateCursor();
}
