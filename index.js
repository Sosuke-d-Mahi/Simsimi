const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;


app.use(bodyParser.json());

// SQLite Database Setup
const db = new sqlite3.Database(':memory:');


db.serialize(() => {
  db.run(`CREATE TABLE chat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    input TEXT UNIQUE,
    responses TEXT
  )`);
});

// Translation Functions
async function translateAPI(text, lang) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;

  try {
    const response = await axios.get(url);
    const data = response.data;

    if (data && data.length > 0 && data[0].length > 0 && data[0][0].length > 0) {
      return data[0][0][0];
    } else {
      throw new Error("Unable to extract translated text from the API response.");
    }
  } catch (error) {
    throw new Error("Error fetching translation:", error.message);
  }
}

async function samirtranslate(text, lang = 'en') {
  if (typeof text !== "string") throw new Error("The first argument (text) must be a string");
  if (typeof lang !== "string") throw new Error("The second argument (lang) must be a string");

  return translateAPI(text, lang);
}

// Math Evaluation Function
function evaluateMath(expression) {
  try {
    expression = expression.replace(/[^\d+\-*/().^√]/g, '');
    expression = expression.replace(/\^/g, '**').replace(/√\(([^)]+)\)/g, 'Math.sqrt($1)');
    const result = eval(expression);
    return result !== undefined ? result.toString() : null;
  } catch (error) {
    return null;
  }
}

// Random Choice Function
function chooseRandomly(input) {
  const regex = /choose between\s+(.+?)\s+and\s+(.+)/i;
  const match = input.match(regex);

  if (match && match.length === 3) {
    const option1 = match[1].trim();
    const option2 = match[2].trim();
    const choices = [option1, option2];
    const randomChoice = choices[Math.floor(Math.random() * choices.length)];
    return `I choose ${randomChoice}.`;
  } else {
    return 'Please provide a valid format: "choose between name1 and name2".';
  }
}

// Date and Time Function
function getDateTimeInfo(query) {
  const now = new Date();

  if (/current date|what is the date|date/i.test(query)) {
    return `The current date is ${now.toLocaleDateString()}.`;
  }

  if (/what time is it|current time|time/i.test(query)) {
    return `The current time is ${now.toLocaleTimeString()}.`;
  }

  if (/time in bangladesh/i.test(query)) {
    const bangladeshTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
    return `The current time in Bangladesh is ${bangladeshTime.toLocaleTimeString()}.`;
  }

  return null;
}

// Chat Endpoint
app.post('/chat', async (req, res) => {
  const { input, lang = 'en' } = req.body;

  const normalizedInput = input.toLowerCase();
  const mathResult = evaluateMath(normalizedInput);
  const randomChoiceResult = chooseRandomly(normalizedInput);
  const dateTimeResult = getDateTimeInfo(normalizedInput);

  if (dateTimeResult) {
    const translatedResponse = await samirtranslate(dateTimeResult, lang);
    return res.send({ response: translatedResponse });
  }

  if (mathResult !== null) {
    const mathExpression = normalizedInput.replace(/[^0-9+\-*/().^√]/g, '');
    const formattedResponse = `The equation of ${mathExpression} would be ${mathResult}.`;
    const translatedResponse = await samirtranslate(formattedResponse, lang);
    return res.send({ response: translatedResponse });
  }

  if (randomChoiceResult !== 'Please provide a valid format: "choose between name1 and name2".') {
    const translatedResponse = await samirtranslate(randomChoiceResult, lang);
    return res.send({ response: translatedResponse });
  }

  db.get('SELECT responses FROM chat WHERE input = ?', [normalizedInput], async (err, row) => {
    if (err) {
      return res.status(500).send({ error: 'Database error' });
    }

    if (row) {
      const responses = JSON.parse(row.responses);
      console.log(`Responses for ${normalizedInput}:`, responses);
      if (responses.length > 0) {
        const randomResponse = responses[Math.floor(Math.random() * responses.length)];
        const translatedResponse = await samirtranslate(randomResponse, lang);
        return res.send({ response: translatedResponse });
      } else {
        const defaultResponse = `I don't know about "${input}", but I'll learn!`;
        return res.send({ response: defaultResponse });
      }
    } else {
      const defaultResponse = `I don't know about "${input}", but I'll learn!`;
      return res.send({ response: defaultResponse });
    }
  });
});

// Tech Endpoint
app.post('/tech', async (req, res) => {
  const { input, response, lang = 'en' } = req.body;

  const normalizedInput = input.toLowerCase();
  const translatedResponse = await samirtranslate(response, 'en');

  db.get('SELECT responses FROM chat WHERE input = ?', [normalizedInput], (err, row) => {
    if (err) {
      return res.status(500).send({ error: 'Database error' });
    }

    let responses;
    if (row) {
      responses = JSON.parse(row.responses);
      if (!responses.includes(translatedResponse)) {
        responses.push(translatedResponse);
        db.run('UPDATE chat SET responses = ? WHERE input = ?', [JSON.stringify(responses), normalizedInput], function(err) {
          if (err) {
            return res.status(500).send({ error: 'Database error' });
          }
          console.log(`Updated responses for ${normalizedInput}:`, responses);
          return res.send({ message: `Response added: "${response}"` });
        });
      } else {
        return res.send({ message: `Response already exists: "${response}"` });
      }
    } else {
      responses = [translatedResponse];
      db.run('INSERT INTO chat (input, responses) VALUES (?, ?)', [normalizedInput, JSON.stringify(responses)], function(err) {
        if (err) {
          return res.status(500).send({ error: 'Database error' });
        }
        console.log(`Inserted new entry for ${normalizedInput}:`, responses);
        return res.send({ message: `Response added: "${response}"` });
      });
    }
  });
});

// Delete Endpoint
app.delete('/delete', async (req, res) => {
  const { input, response, lang = 'en' } = req.body;

  const normalizedInput = input.toLowerCase();

  const translatedInput = await samirtranslate(normalizedInput, 'en');

  db.get('SELECT responses FROM chat WHERE input = ?', [translatedInput], (err, row) => {
    if (err) {
      return res.status(500).send({ error: 'Database error' });
    }

    if (row) {
      let responses = JSON.parse(row.responses);
      if (response) {
        samirtranslate(response, 'en').then(translatedResponse => {
          responses = responses.filter(res => res !== translatedResponse);

          if (responses.length > 0) {
            db.run('UPDATE chat SET responses = ? WHERE input = ?', [JSON.stringify(responses), translatedInput], function(err) {
              if (err) {
                return res.status(500).send({ error: 'Database error' });
              }
              return res.send({ message: `Response "${response}" deleted from input "${input}"` });
            });
          } else {
            db.run('DELETE FROM chat WHERE input = ?', [translatedInput], function(err) {
              if (err) {
                return res.status(500).send({ error: 'Database error' });
              }
              return res.send({ message: `No more responses left for input "${input}", entry deleted` });
            });
          }
        });
      } else {
        db.run('DELETE FROM chat WHERE input = ?', [translatedInput], function(err) {
          if (err) {
            return res.status(500).send({ error: 'Database error' });
          }
          return res.send({ message: `All responses for input "${input}" deleted` });
        });
      }
    } else {
      return res.send({ message: `No chat found with input: "${input}"` });
    }
  });
});

// Start the Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
