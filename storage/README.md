# Runtime storage

Production uploads are stored outside Git. The first deployment may use a local `uploads/` directory; the media service keeps storage replaceable so it can later move to an object store.
