const gallery = document.getElementById("gallery");

const photos = JSON.parse(sessionStorage.getItem("photos")) || [];
const videos = JSON.parse(sessionStorage.getItem("videos")) || [];


photos.forEach((src, index) => {
  createItem("image", src, index, "photos");
});


videos.forEach((src, index) => {
  createItem("video", src, index, "videos");
});

function createItem(type, src, index, storageKey) {
  const item = document.createElement("div");
  item.className = "gallery-item";

  let media;
  if (type === "image") {
    media = document.createElement("img");
    media.src = src;
  } else {
    media = document.createElement("video");
    media.src = src;
    media.controls = true;
    media.preload = "metadata";
  }

  const downloadBtn = document.createElement("button");
  downloadBtn.textContent = "⬇ Download";

  downloadBtn.onclick = () => {
    const a = document.createElement("a");
    a.href = src;
    a.download = type === "video" ? "PixiCam_Video.mp4" : "PixiCam_Photo.png";
    a.click();
  };

  const deleteBtn = document.createElement("button");
  deleteBtn.textContent = "🗑 Delete";

  deleteBtn.onclick = () => {
    item.remove();
    const data = JSON.parse(sessionStorage.getItem(storageKey)) || [];
    data.splice(index, 1);
    sessionStorage.setItem(storageKey, JSON.stringify(data));
  };

  item.appendChild(media);
  item.appendChild(downloadBtn);
  item.appendChild(deleteBtn);
  gallery.appendChild(item);
}
