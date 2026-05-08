import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';

import authRoutes from './routes/auth.js';
import channelRoutes from './routes/channels.js';
import campaignRoutes from './routes/campaigns.js';
import dataRoutes from './routes/data.js';
import userRoutes from './routes/users.js';
import reportRoutes from './routes/reports.js';
import monitorRoutes from './routes/monitor.js';
import settingsRoutes from './routes/settings.js';

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors({
  origin: '*',
  credentials: true
}));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/campains', campaignRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/settings', settingsRoutes);

export default app;
