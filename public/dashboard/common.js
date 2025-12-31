document.addEventListener('DOMContentLoaded', () => {
    // --- 1. Kiểm tra đăng nhập ---
    const userStr = localStorage.getItem('currentUser');
    const isLoginPage = window.location.pathname.includes('/login/login.html');

    if (!userStr) {
        // Nếu không có user và không phải đang ở trang login -> Đá về login
        if (!isLoginPage) {
            window.location.href = '/login/login.html';
        }
        return; // Dừng thực thi nếu chưa đăng nhập
    }

    const user = JSON.parse(userStr);

    // --- 2. Hiển thị thông tin User (Avatar, Tên, Role) ---
    const userWrapper = document.querySelector('.user-wrapper');
    if (userWrapper) {
        const img = userWrapper.querySelector('img');
        const name = userWrapper.querySelector('h4');
        const role = userWrapper.querySelector('small');

        // Cập nhật Avatar
        if (img && user.avatar) {
            img.src = user.avatar;
        } else if (img) {
            // Avatar mặc định nếu không có
            img.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name)}&background=random`;
        }

        // Cập nhật Tên
        if (name) name.textContent = user.full_name || user.email;

        // Cập nhật Role (Hiển thị tiếng Việt cho đẹp)
        if (role) {
            const roleMap = {
                'admin': 'Quản trị viên',
                'athlete': 'Vận động viên',
                'coach': 'Huấn luyện viên',
                'referee': 'Trọng tài'
            };
            role.textContent = roleMap[user.role] || user.role;
        }
    }

    // --- 3. Xử lý Đăng xuất ---
    const logoutBtn = document.querySelector('.logout-icon');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
                localStorage.removeItem('currentUser');
                window.location.href = '/login/login.html';
            }
        });
    }

    // --- 4. Active Sidebar (Tự động highlight menu) ---
    const currentPath = window.location.pathname;
    const menuLinks = document.querySelectorAll('.sidebar-menu a');

    menuLinks.forEach(link => {
        // Xóa class active cũ
        link.classList.remove('active');

        // Lấy đường dẫn từ href
        const href = link.getAttribute('href');

        // Nếu đường dẫn hiện tại chứa href của menu -> Active
        // (Loại trừ trường hợp href="#" hoặc rỗng)
        if (href && href !== '#' && href !== '' && currentPath.includes(href)) {
            link.classList.add('active');
        }
    });
});