const MEDIA_MAX = 64 * 1024 * 1024;

const draftAttachments = {
  post: []
};

const draftMedia = {
  post: new Map()
};

const audioLoadToken = {
  post: 0
};

let postDraftMediaLoading = false;

function isPostDraftMediaLoading() {
  return postDraftMediaLoading;
}


let editingPostId = null;

let postDraftImages = [];
