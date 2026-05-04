import { adapter } from '../../decoro.config.ts';
import { HomeShell } from '../components/home-shell.tsx';

const HomePage = () => (
  <HomeShell tagline={`AI UI generation for ${adapter.metadata.displayName}`} />
);

export default HomePage;
