import { useAuth } from '../hooks/useAuth';
import { useGame } from '../context/GameContext';
import jaffaLogo from 'figma:asset/664ae28598058626f6f581874440c5d6683e5706.png';
import { GiAlarmClock, GiCrownCoin } from 'react-icons/gi';
import { Avatar, AvatarFallback } from './ui/avatar';
import { useNavigate } from 'react-router';

export default function Header() {
  const navigate = useNavigate();
  const { state } = useGame();

  return (
    <header
      className="bg-[#1a1a1a] sticky top-0 z-40"
      style={{ borderBottom: '3px solid #ff6341', boxShadow: '0 4px 0 0 #000' }}
    >
      <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => navigate('/lobby')}
          className="flex items-center"
          style={{ background: 'none', border: 'none', boxShadow: 'none' }}
        >
          <img
            src={jaffaLogo}
            alt="JAFFA"
            className="h-32 sm:h-40 md:h-48 w-auto object-contain"
          />
        </button>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Points chip */}
          {state.totalPoints > 0 && (
            <div
              className="flex items-center gap-1 px-3 py-1"
              style={{ background: '#ff6341', border: '2px solid #000', borderRadius: '2px', boxShadow: '2px 2px 0 0 #000' }}
            >
              <GiCrownCoin className="w-4 h-4 text-black" fill="currentColor" />
              <span className="text-black text-sm font-black">{state.totalPoints}</span>
            </div>
          )}

          {/* Notifications */}
          <button
            className="p-2 relative"
            style={{ background: '#222', border: '2px solid #333', borderRadius: '2px', boxShadow: '2px 2px 0 0 #ff6341' }}
          >
            <GiAlarmClock className="w-5 h-5 text-white" fill="currentColor" />
            <span
              className="absolute top-0.5 right-0.5 w-2 h-2 bg-[#ff6341]"
              style={{ border: '1px solid #000' }}
            />
          </button>

          {/* Profile */}
          <button
            onClick={() => navigate('/profile')}
            className="flex items-center gap-2 px-3 py-1.5"
            style={{ background: '#222', border: '2px solid #333', borderRadius: '2px', boxShadow: '2px 2px 0 0 #ff6341' }}
          >
            <Avatar className="w-7 h-7" style={{ border: '2px solid #ff6341', borderRadius: '2px' }}>
              <AvatarFallback
                className="text-black text-xs font-black"
                style={{ background: '#ff6341', borderRadius: '0' }}
              >
                {state.user?.displayName?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-black text-white hidden sm:block uppercase tracking-wider">
              {state.user?.displayName || 'User'}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}
