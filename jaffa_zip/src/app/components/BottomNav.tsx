import { useLocation, useNavigate } from 'react-router';
import { GiCastle, GiPodiumWinner, GiTrophyCup, GiMeeple } from 'react-icons/gi';

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { icon: GiCastle, label: 'Home', path: '/lobby' },
    { icon: GiPodiumWinner, label: 'Leaderboard', path: '/leaderboard' },
    { icon: GiTrophyCup, label: 'Rewards', path: '/rewards' },
    { icon: GiMeeple, label: 'Profile', path: '/profile' },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-[#1a1a1a] z-40"
      style={{ borderTop: '3px solid #ff6341', boxShadow: '0 -4px 0 0 #000' }}
    >
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="flex flex-col items-center gap-1 px-4 py-2 transition-all"
                style={{
                  color: isActive ? '#ff6341' : 'rgba(255,255,255,0.5)',
                  background: 'none',
                  border: 'none',
                  boxShadow: 'none',
                  borderBottom: isActive ? '3px solid #ff6341' : '3px solid transparent',
                }}
              >
                <item.icon
                  className="w-6 h-6"
                  fill="currentColor"
                />
                <span className="text-xs font-black uppercase tracking-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
