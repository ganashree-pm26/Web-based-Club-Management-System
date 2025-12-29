// test-views.js
const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'views');
const expectedViews = [
  'auth/login.ejs',
  'admin/dashboard.ejs',
  'events/list.ejs',
  'events/create.ejs',
  'events/edit.ejs',
  'participants/list.ejs',
  'participants/register.ejs',
  'members/tasks.ejs',
  'feedback/form.ejs',
  'feedback/success.ejs',
  'feedback/error.ejs',
  'sponsors/event.ejs'
];

console.log('Checking views...\n');
let allExist = true;

expectedViews.forEach(view => {
  const viewPath = path.join(viewsDir, view);
  const exists = fs.existsSync(viewPath);
  console.log(`${exists ? '✓' : '✗'} ${view}`);
  if (!exists) allExist = false;
});

console.log(`\n${allExist ? 'All views exist!' : 'Some views are missing!'}`);