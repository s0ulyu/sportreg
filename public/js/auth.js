document.addEventListener('DOMContentLoaded', () => {
    // 1. Kiểm tra đăng nhập
    const userStr = localStorage.getItem('user');
    if (!userStr) {
        // Nếu chưa đăng nhập, đá về trang login
        window.location.href = '/login/login.html';
        return;
    }

    const user = JSON.parse(userStr);

    // 2. Logic giao diện: Thêm class role vào body để CSS xử lý ẩn/hiện menu
    // Ví dụ: body.role-athlete sẽ bị ẩn menu Users, Settings (do CSS dashboard.css quy định)
    if (user.role) {
        document.body.classList.add('role-' + user.role);
    }

    // 3. Bảo vệ trang Admin (Security Check)
    // Danh sách các trang chỉ dành cho Admin
    const adminPages = [
        'admin-score.html',
        'schedule-optimize.html',
        'users.html'
    ];

    const isProtectedPage = adminPages.some(page => window.location.pathname.includes(page));

    if (isProtectedPage && user.role !== 'admin') {
        alert('Cảnh báo: Bạn không có quyền truy cập trang quản trị!');
        window.location.href = '/dashboard/dashboard.html';
    }
});