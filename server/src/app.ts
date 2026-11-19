import express from 'express';
import cors from 'cors';
import evaluationRoutes from './routes/evaluationRoutes';
import dataRoutes from './routes/dataRoutes';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', evaluationRoutes);
app.use('/api/data', dataRoutes);

export default app;
