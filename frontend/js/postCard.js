// Shared rendering for a single community post card — used both by the
// main community feed (community.js) and a user's own posts list on their
// profile page (profile.js), so post display stays consistent.

function renderPostCard(post, currentUserId, handlers) {
  const card = document.createElement("div");
  card.className = "post-card";

  const header = document.createElement("div");
  header.className = "post-card-header";
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  avatar.textContent = (post.author?.name || "?").charAt(0).toUpperCase();
  const authorLink = document.createElement("a");
  authorLink.href = `profile.html?id=${post.author?.id || ""}`;
  authorLink.textContent = post.author?.name || "Unknown";
  authorLink.className = "post-author-link";
  const date = document.createElement("span");
  date.className = "post-date";
  date.textContent = new Date(post.createdAt).toLocaleDateString();
  header.append(avatar, authorLink, date);
  card.appendChild(header);

  if (post.beforeImageUrl || post.afterImageUrl) {
    const images = document.createElement("div");
    images.className = "post-images";
    if (post.beforeImageUrl) {
      const wrap = document.createElement("div");
      wrap.innerHTML = `<span class="post-image-label">Before</span>`;
      const img = document.createElement("img");
      img.src = post.beforeImageUrl;
      wrap.appendChild(img);
      images.appendChild(wrap);
    }
    if (post.afterImageUrl) {
      const wrap = document.createElement("div");
      wrap.innerHTML = `<span class="post-image-label">After</span>`;
      const img = document.createElement("img");
      img.src = post.afterImageUrl;
      wrap.appendChild(img);
      images.appendChild(wrap);
    }
    card.appendChild(images);
  }

  const desc = document.createElement("p");
  desc.className = "post-description";
  desc.textContent = post.description;
  card.appendChild(desc);

  const actions = document.createElement("div");
  actions.className = "post-actions";

  const likeButton = document.createElement("button");
  likeButton.type = "button";
  likeButton.className = `like-button${post.likedByMe ? " active" : ""}`;
  likeButton.innerHTML = `${Icons.heart({ filled: post.likedByMe })} <span>${post.likeCount}</span>`;
  likeButton.addEventListener("click", () => handlers.onLike(post, !post.likedByMe));
  actions.appendChild(likeButton);

  const commentButton = document.createElement("button");
  commentButton.type = "button";
  commentButton.innerHTML = `${Icons.messageCircle()} <span>${post.commentCount}</span>`;
  commentButton.addEventListener("click", () => handlers.onToggleComments(post, commentsSection));
  actions.appendChild(commentButton);

  if (post.userId === currentUserId) {
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => handlers.onEdit(post));
    actions.appendChild(editButton);

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", () => handlers.onDelete(post));
    actions.appendChild(deleteButton);
  } else {
    const reportButton = document.createElement("button");
    reportButton.type = "button";
    reportButton.textContent = "Report";
    reportButton.addEventListener("click", () => handlers.onReport(post));
    actions.appendChild(reportButton);
  }

  card.appendChild(actions);

  const commentsSection = document.createElement("div");
  commentsSection.className = "post-comments";
  commentsSection.hidden = true;
  card.appendChild(commentsSection);

  return card;
}

function renderComments(container, comments, currentUserId, handlers) {
  container.innerHTML = "";
  const list = document.createElement("div");
  list.className = "comments-list";
  comments.forEach((comment) => {
    const row = document.createElement("div");
    row.className = "comment-row";
    const text = document.createElement("span");
    text.innerHTML = `<strong>${escapeHtml(comment.author?.name || "Unknown")}:</strong> `;
    text.appendChild(document.createTextNode(comment.text));
    row.appendChild(text);
    if (comment.userId === currentUserId) {
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "×";
      del.title = "Delete comment";
      del.addEventListener("click", () => handlers.onDeleteComment(comment));
      row.appendChild(del);
    }
    list.appendChild(row);
  });
  container.appendChild(list);

  const form = document.createElement("form");
  form.className = "comment-form";
  form.innerHTML = `<input type="text" placeholder="Write a comment..." maxlength="1000"><button type="submit">Send</button>`;
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = form.querySelector("input");
    if (!input.value.trim()) return;
    handlers.onAddComment(input.value.trim());
    input.value = "";
  });
  container.appendChild(form);
}
