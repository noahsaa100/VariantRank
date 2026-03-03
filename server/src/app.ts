import express from 'express';
import cors from 'cors';
import evaluationRoutes from './routes/evaluationRoutes';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api', evaluationRoutes);

export default app;
