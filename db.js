let db;
const request = indexedDB.open("MediaDB", 1);

request.onupgradeneeded = e => {
  db = e.target.result;
  db.createObjectStore("photos", { autoIncrement: true });
  db.createObjectStore("videos", { autoIncrement: true });
};

request.onsuccess = e => db = e.target.result;

function saveMedia(storeName, blob) {
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).add(blob);
}

function loadMedia(storeName, callback) {
  const tx = db.transaction(storeName, "readonly");
  const store = tx.objectStore(storeName);
  const req = store.openCursor();

  req.onsuccess = e => {
    const cursor = e.target.result;
    if (cursor) {
      callback(cursor.key, cursor.value);
      cursor.continue();
    }
  };
}

function deleteMedia(storeName, key) {
  const tx = db.transaction(storeName, "readwrite");
  tx.objectStore(storeName).delete(key);
}
