import { RouterProvider } from 'react-router';
import { router } from './routes';
import { GameProvider } from './context/GameContext';
import { Toaster } from 'sonner';
import '../styles/index.css';

function App() {
  return (
    <GameProvider>
      <RouterProvider router={router} />
      <Toaster position="top-center" theme="dark" />
    </GameProvider>
  );
}

export default App;
