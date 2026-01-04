const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const indicator = document.getElementById("indicator");

let recorder;
let chunks = [];


navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    video.srcObject = stream;
    window.stream = stream;
  })
  .catch(() => alert("Camera access denied"));


function capturePhoto() {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext("2d").drawImage(video, 0, 0);

  const imgBase64 = canvas.toDataURL("image/png");

  const photos = JSON.parse(sessionStorage.getItem("photos")) || [];
  photos.push(imgBase64);
  sessionStorage.setItem("photos", JSON.stringify(photos));
}


function startRecording() {
  chunks = [];
  recorder = new MediaRecorder(window.stream, { mimeType: "video/webm" });

  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.start();

  indicator.style.display = "block";
}


function stopRecording() {
  if (!recorder) return;

  recorder.stop();
  indicator.style.display = "none";

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: "video/webm" });
    const reader = new FileReader();

    reader.onloadend = () => {
      const base64Video = reader.result;
      const videos = JSON.parse(sessionStorage.getItem("videos")) || [];
      videos.push(base64Video);
      sessionStorage.setItem("videos", JSON.stringify(videos));
    };

    reader.readAsDataURL(blob);
  };
}
