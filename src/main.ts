import './styles.css';
import { startApp } from './ui/controller';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Missing #app root');
}

startApp(app);
