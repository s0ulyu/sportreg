document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMsg = document.getElementById('error-msg');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault(); // 1. Ngăn form reload trang

            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;

            // Reset thông báo lỗi
            if (errorMsg) errorMsg.style.display = 'none';

            try {
                // 2. Gọi API đăng nhập
                const res = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (res.ok && data.success) {
                    // 3. QUAN TRỌNG: Lưu key 'user' để common.js nhận diện
                    localStorage.setItem('user', JSON.stringify(data.user));
                    
                    // 4. Chuyển hướng về Dashboard
                    window.location.href = '/dashboard/dashboard.html';
                } else {
                    // Hiển thị lỗi từ server
                    if (errorMsg) {
                        errorMsg.textContent = data.message || 'Đăng nhập thất bại';
                        errorMsg.style.display = 'block';
                    } else {
                        alert(data.message || 'Đăng nhập thất bại');
                    }
                }
            } catch (err) {
                console.error(err);
                if (errorMsg) {
                    errorMsg.textContent = 'Lỗi kết nối đến server';
                    errorMsg.style.display = 'block';
                }
            }
        });
    }
});