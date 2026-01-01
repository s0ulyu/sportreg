document.addEventListener('DOMContentLoaded', async () => {
    const listContainer = document.getElementById('tournaments-list');
    
    // Lấy user từ localStorage (đã được common.js check Auth Guard)
    const userStr = localStorage.getItem('user');
    const user = userStr ? JSON.parse(userStr) : null;

    if (!user) return;

    // Hàm load danh sách giải đấu
    async function loadTournaments() {
        try {
            const response = await fetch('/api/tournaments');
            const tournaments = await response.json();

            listContainer.innerHTML = '';

            if (tournaments.length === 0) {
                listContainer.innerHTML = '<p>Hiện không có giải đấu nào.</p>';
                return;
            }

            tournaments.forEach(t => {
                // Xác định trạng thái để hiển thị
                let statusLabel = 'Đã kết thúc';
                let statusClass = 'closed';
                let isDisabled = true;

                if (t.status === 'open') {
                    statusLabel = 'Đang mở đăng ký';
                    statusClass = 'open';
                    isDisabled = false;
                } else if (t.status === 'upcoming') {
                    statusLabel = 'Sắp mở';
                    statusClass = 'upcoming';
                }

                const card = document.createElement('div');
                card.className = 'tournament-card';
                card.innerHTML = `
                    <div>
                        <h3>${t.name}</h3>
                        <span class="status-badge ${statusClass}">${statusLabel}</span>
                        <p><i class='bx bx-trophy'></i> ${t.sport_type}</p>
                        <p><i class='bx bx-calendar'></i> ${new Date(t.start_date).toLocaleDateString('vi-VN')}</p>
                        <p><i class='bx bx-map'></i> ${t.location}</p>
                    </div>
                    <button class="btn-register" onclick="registerTournament(${t.id})" ${isDisabled ? 'disabled' : ''}>
                        ${isDisabled ? 'Không khả dụng' : 'Đăng ký ngay'}
                    </button>
                `;
                listContainer.appendChild(card);
            });

        } catch (error) {
            console.error(error);
            listContainer.innerHTML = '<p>Lỗi tải dữ liệu từ server.</p>';
        }
    }

    // Hàm xử lý đăng ký (Gắn vào window để gọi được từ onclick HTML)
    window.registerTournament = async (tournamentId) => {
        if (!confirm('Bạn có chắc chắn muốn đăng ký tham gia giải đấu này?')) return;

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, tournamentId: tournamentId })
            });

            const data = await res.json();
            alert(data.message);
        } catch (err) {
            console.error(err);
            alert('Lỗi kết nối server');
        }
    };

    // Chạy hàm load
    loadTournaments();
});