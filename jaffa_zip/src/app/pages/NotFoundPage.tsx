import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { GiCastle } from 'react-icons/gi';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f1419] via-[#1a1f2b] to-[#29374b] flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center"
      >
        <h1 className="text-9xl font-extrabold text-[#c92946] mb-4">404</h1>
        <h2 className="text-4xl font-extrabold text-[#d9deeb] mb-4">
          PAGE NOT FOUND
        </h2>
        <p className="text-lg text-[#d9deeb]/60 mb-8">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <button
          onClick={() => navigate('/')}
          className="btn-primary px-8 py-4 rounded-xl text-white font-bold inline-flex items-center gap-2"
        >
          <GiCastle className="w-5 h-5" />
          GO HOME
        </button>
      </motion.div>
    </div>
  );
}