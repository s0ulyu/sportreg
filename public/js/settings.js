document.addEventListener("DOMContentLoaded", () => {
    const userStr = localStorage.getItem("user");
    if (!userStr) return;
    const user = JSON.parse(userStr);
    const userId = user.id;

    const inputFullname = document.getElementById("input-fullname");
    const inputEmail = document.getElementById("input-email");
    const inputPhone = document.getElementById("input-phone");
    const avatarImg = document.getElementById("avatar-img");
    const inputAvatar = document.getElementById("input-avatar");
    const btnUploadAvatar = document.getElementById("btn-upload-avatar");

    const accountForm = document.getElementById("account-form");
    const passwordForm = document.getElementById("password-form");

    // Prefill by fetching from server
    fetch(`/api/user/${userId}`, {
        headers: {
            "x-user-id": userId,
            "x-role": user.role,
        },
    })
        .then((r) => r.json())
        .then((data) => {
            inputFullname.value = data.full_name || "";
            inputEmail.value = data.email || "";
            // If your users table has phone, you can set it here (data.phone)
            if (data.phone) inputPhone.value = data.phone;
            if (data.avatar) {
                avatarImg.src = data.avatar;
                user.avatar = data.avatar;
                localStorage.setItem("user", JSON.stringify(user));
            }
        })
        .catch((err) => console.error("Failed to load profile", err));

    // Save account (update name)
    accountForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const full_name = inputFullname.value.trim();
        if (!full_name) return alert("Vui lòng nhập họ và tên");

        fetch(`/api/user/${userId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "x-user-id": userId,
                "x-role": user.role,
            },
            body: JSON.stringify({ full_name, phone: inputPhone.value.trim() }),
        })
            .then((r) => r.json())
            .then((res) => {
                if (res.success) {
                    alert("Cập nhật thông tin thành công");
                    // Update localStorage user full_name and phone
                    user.full_name = full_name;
                    user.phone = inputPhone.value.trim();
                    localStorage.setItem("user", JSON.stringify(user));
                    // Update header display if any
                } else {
                    alert(res.message || "Lỗi khi cập nhật");
                }
            })
            .catch((err) => {
                console.error(err);
                alert("Lỗi khi cập nhật");
            });
    });

    // Change password
    passwordForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const currentPassword = document.getElementById("input-current-password").value;
        const newPassword = document.getElementById("input-new-password").value;
        const confirmPassword = document.getElementById("input-confirm-password").value;

        if (!currentPassword || !newPassword || !confirmPassword) return alert("Vui lòng điền đầy đủ thông tin");
        if (newPassword !== confirmPassword) return alert("Mật khẩu mới không khớp");

        fetch(`/api/user/${userId}/password`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "x-user-id": userId,
                "x-role": user.role,
            },
            body: JSON.stringify({ currentPassword, newPassword }),
        })
            .then((r) => r.json())
            .then((res) => {
                if (res.success) {
                    alert("Đổi mật khẩu thành công");
                    passwordForm.reset();
                } else {
                    alert(res.message || "Lỗi khi đổi mật khẩu");
                }
            })
            .catch((err) => {
                console.error(err);
                alert("Lỗi khi đổi mật khẩu");
            });
    });

    // Upload avatar
    btnUploadAvatar.addEventListener("click", () => {
        const file = inputAvatar.files[0];
        if (!file) return alert("Vui lòng chọn ảnh trước khi tải lên");

        const fd = new FormData();
        fd.append("avatar", file);

        fetch(`/api/user/${userId}/avatar`, {
            method: "POST",
            headers: {
                "x-user-id": userId,
                "x-role": user.role,
            },
            body: fd,
        })
            .then((r) => r.json())
            .then((res) => {
                if (res.success) {
                    avatarImg.src = res.avatar;
                    user.avatar = res.avatar;
                    localStorage.setItem("user", JSON.stringify(user));
                    alert("Tải ảnh đại diện thành công");
                } else {
                    alert(res.message || "Lỗi khi tải ảnh");
                }
            })
            .catch((err) => {
                console.error(err);
                alert("Lỗi khi tải ảnh");
            });
    });
});
