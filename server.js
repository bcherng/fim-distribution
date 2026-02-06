import app from './src/app.js';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`FIM Distribution Server running on port ${PORT}`);
});
