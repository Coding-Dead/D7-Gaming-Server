import { Elysia, t } from 'elysia';
import swagger from '@elysiajs/swagger';
import Database from 'bun:sqlite';

type UserScore = {
  user_name: string;
  score: number;
  position: number;
};
const db = new Database('./db.sqlite');

const createTable = () => {
  db.query(
    `CREATE TABLE IF NOT EXISTS user_scores (
            user_name TEXT NOT NULL UNIQUE,
            score INTEGER NOT NULL
        );`
  ).run();
};

createTable();

const addHighScore = db.query(
  'INSERT INTO user_scores (user_name, score) VALUES ($user_name, $score);'
);
const getHighScores = db.query('SELECT * FROM user_scores ORDER BY score DESC LIMIT 10;');
const checkUserExists = db.query('SELECT * FROM user_scores WHERE user_name = $user_name;');
const getUserPosition = db.query(`
    SELECT user_name, score, (
        SELECT COUNT(*) + 1
        FROM user_scores AS sub
        WHERE sub.score > main.score
    ) AS position
    FROM user_scores AS main
    WHERE user_name = $user_name;
`);

const addScore = (name: string, score: number): boolean => {
  const userExists = checkUserExists.get({ $user_name: name });
  if (userExists) {
    return false;
  }
  addHighScore.run({ $user_name: name, $score: score });
  return true;
};

const getPosition = (name: string): UserScore | null => {
  const userExists = checkUserExists.get({ $user_name: name });
  if (!userExists) {
    return null;
  }
  return getUserPosition.get({ $user_name: name }) as UserScore;
};

const app = new Elysia()
  .use(swagger())
  .post(
    '/scores',
    ({ set, body: { name, score } }) => {
      const message = addScore(name, score);
      if (!message) {
        set.status = 409;
        return {
          message: 'User already exists',
        };
      }
      return {
        message: 'Score added',
      };
    },
    {
      body: t.Object({
        name: t.String(),
        score: t.Numeric(),
      }),
    }
  )
  .get('/scores', () => {
    return getHighScores.all();
  })
  .get('/scores/:name', ({ set, params: { name } }) => {
    const position = getPosition(name);
    if (!position) {
      set.status = 409;
      return {
        message: 'User not found',
      };
    }
    return getPosition(name);
  })
  .listen(3000);

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);
