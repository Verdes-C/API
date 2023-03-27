import * as dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import mongoose, { isValidObjectId } from 'mongoose';
import bodyParser from 'body-parser';
import fs from 'fs';

const app = express();
import cors from 'cors';
import { rejects } from 'assert';
import { resolve } from 'path';
app.use(cors()); // used to allow front-end to request from backend on different domains

// parse urlencoded and application/json
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

mongoose.set('strictQuery', false);
mongoose.connect(process.env.DATABASE_URL, {
  useNewUrlParser: true,
  autoIndex: true,
});

// ---------- USER SCHEMA ----------

const personSchema = new mongoose.Schema({
  email: {
    type: String,
    required: false,
    default: '',
  },
  nume: {
    type: String,
    required: false,
    default: '',
  },
  telefon: {
    type: String,
    required: true,
    unique: true,
  },
});

personSchema.index({ telefon: 1 }, { unique: true });

const Person = mongoose.model('Person', personSchema);

//          REGEX
function checkIfPhoneNumberIsValid(number) {
  const regexWith0 = /^07\d{8}$/;
  const regexWithout0 = /^7\d{8}$/;
  if (regexWith0.test(number)) {
    return 0;
  } else if (regexWithout0.test(number)) {
    return 1;
  } else {
    return 2;
  }
}

//          Write Error To File
function writeErrorToFile(error) {
  fs.appendFile('errors.txt', String(error) + new Date() + '\n', (err) => {
    if (err) {
      rejects(err);
    } else {
      resolve();
    }
  });
}

function sendWrongFormat(res) {
  res.send(
    'Numarul specificat nu corescunde formatului 07XXXXXXXX sau 7XXXXXXXX. Verificati.'
  );
}

function createNewEntry(nume, telefon, email, res) {
  const intrareNoua = new Person({
    nume: nume || '',
    telefon: '',
    email: email || '',
  });
  if (checkIfPhoneNumberIsValid(telefon) == 0) {
    intrareNoua.telefon = telefon;
  } else if (checkIfPhoneNumberIsValid(telefon) == 1) {
    intrareNoua.telefon = '0' + telefon;
  } else {
    return 0;
  }
  return intrareNoua;
}

app.get('/getAll', async (req, res) => {
  const telefonFilter = Person.find({}, 'telefon');
  const result = await telefonFilter.exec();
  let resultToSend = '';
  result.forEach((object) => {
    resultToSend = resultToSend + object.telefon + ' ';
  });
  res.send(resultToSend);
});

app.post('/addOne', async (req, res) => {
  const { nume, telefon, email } = req.body;
  const intrareNoua = createNewEntry(nume, telefon, email, res);
  if (intrareNoua == 0) {
    sendWrongFormat(res);
    return;
  }

  try {
    await intrareNoua.save({ runValidators: true });
  } catch (error) {
    if (error.code == 11000) {
      res.send('Numarul specificat exista deja in baza de date');
      return;
    } else {
      writeErrorToFile(error);
      res.send(
        'A aparut o eroare. Am colectat date despre aceasta. Contactati service support sau reveniti dupa verificarea datelor. Va multumim!'
      );
    }
  }
  res.send('Numarul a fost salvat');
});

app.post('/addTelefonNumbersAsStringOrObjects', async (req, res) => {
  let numberOfFailedEntries = 0;
  const { numere } = req.body;
  const itemsToSave = [];
  numere.forEach((entry) => {
    const intrareNoua = createNewEntry(
      entry?.nume,
      entry?.telefon || entry,
      entry?.email,
      res
    );
    if (intrareNoua == 0) {
      numberOfFailedEntries += 1;
    } else {
      itemsToSave.push({
        insertOne: { document: intrareNoua },
      });
    }

    async function saveItems(itemsToSave) {
      try {
        const result = await Person.bulkWrite(itemsToSave, { ordered: false });
        if (result.insertedCount > 0) {
          res.send(result);
        } else {
          writeErrorToFile(
            `Eroare la salvarea numerelor. Am primit urmatoarele date: \n${JSON.stringify(
              req.body
            )} si nu au reusit sa se salveze ${numberOfFailedEntries} numere.`
          );
          res.send(
            `${numberOfFailedEntries} numere nu au fost salvate.  Am colectat date despre aceasta eroare. Contactati service support sau reveniti dupa verificarea datelor. Va multumim!`
          );
        }
        return;
      } catch (error) {
        writeErrorToFile(error);
        res.send(
          `${numberOfFailedEntries} numere nu au fost salvate.  Am colectat date despre aceasta eroare. Contactati service support sau reveniti dupa verificarea datelor. Va multumim!`
        );
        return;
      }
    }

    saveItems(itemsToSave);
  });
});

const port = process.env.PORT;

app.listen(port, function () {
  console.log('Server started on port ' + port);
});
