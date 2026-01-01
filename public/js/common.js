document.addEventListener('DOMContentLoaded', () => {
    // ==========================================
    // 1. AUTH GUARD (Kiểm tra đăng nhập)
    // ==========================================
    // Yêu cầu: Kiểm tra localStorage.getItem('user')
    const userStr = localStorage.getItem('user');
    const path = window.location.pathname;
    
    // Danh sách các trang không yêu cầu đăng nhập
    const publicPages = ['/login/login.html', '/signup.html'];
    const isPublicPage = publicPages.some(page => path.includes(page));

    if (!userStr && !isPublicPage) {
        window.location.href = '/login/login.html';
        return;
    }

    // ==========================================
    // 2. RENDER SIDEBAR (Tự động tạo Menu)
    // ==========================================
    loadSidebar();

    // ==========================================
    // 3. USER INFO & LOGOUT
    // ==========================================
    if (userStr) {
        const user = JSON.parse(userStr);
        
        displayUserInfo(user);
        handleLogout();

        // Thêm class role vào body để hỗ trợ CSS ẩn/hiện menu theo quyền
        if (user.role) {
            document.body.classList.add('role-' + user.role);
        }
    }
});

function loadSidebar() {
    // Tìm container sidebar (thường là <div id="sidebar-container"></div> trong HTML)
    const sidebarContainer = document.getElementById('sidebar-container') || document.querySelector('.sidebar');
    if (!sidebarContainer) return;

    sidebarContainer.innerHTML = `
        <div class="sidebar">
            <div class="sidebar-brand">
                <h2><i class='bx bx-run'></i> <span>SportReg</span></h2>
            </div>
            <div class="sidebar-menu">
                <ul>
                    <li><a href="/dashboard/dashboard.html"><i class='bx bx-grid-alt'></i> <span>Dashboard</span></a></li>
                    <li><a href="/tournaments/tournaments.html"><i class='bx bx-trophy'></i> <span>Giải đấu</span></a></li>
                    <li><a href="/register/register.html"><i class='bx bx-edit'></i> <span>Đăng ký</span></a></li>
                    <li><a href="/live-status/live-status.html"><i class='bx bx-pulse'></i> <span>Trạng thái Realtime</span></a></li>
                    <li class="menu-users"><a href="/user/users.html"><i class='bx bx-user'></i> <span>Người dùng</span></a></li>
                    <li class="menu-settings"><a href="/setting/settings.html"><i class='bx bx-cog'></i> <span>Cài đặt</span></a></li>
                    <li><a href="#" class="logout-btn"><i class='bx bx-log-out'></i> <span>Đăng xuất</span></a></li>
                </ul>
            </div>
        </div>
    `;

    // Active Menu
    const currentPath = window.location.pathname;
    const links = sidebarContainer.querySelectorAll('.sidebar-menu a');
    
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href !== '#' && currentPath.includes(href)) {
            link.classList.add('active');
        }
    });
}

function displayUserInfo(user) {
    const wrappers = document.querySelectorAll('.user-wrapper');
    wrappers.forEach(wrapper => {
        const img = wrapper.querySelector('img');
        const name = wrapper.querySelector('h4');
        const role = wrapper.querySelector('small');

        if (img) img.src = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.full_name || user.email)}&background=random`;
        if (name) name.textContent = user.full_name || user.email;
        if (role) {
            let roleText = user.role;
            if (user.role === 'admin') roleText = 'Quản trị viên';
            else if (user.role === 'athlete') roleText = 'Vận động viên';
            else if (user.role === 'coach') roleText = 'Huấn luyện viên';
            
            role.textContent = roleText;
        }
    });
}

function handleLogout() {
    // Xử lý nút đăng xuất (bao gồm cả nút trong sidebar vừa tạo)
    const logoutBtns = document.querySelectorAll('.logout-icon, .logout-btn');
    logoutBtns.forEach(btn => {
        btn.style.cursor = 'pointer';
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
                localStorage.removeItem('user');
                window.location.href = '/login/login.html';
            }
        });
    });
}