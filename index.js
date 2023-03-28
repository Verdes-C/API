import * as dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';

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

// ---------- PERSON SCHEMA ----------

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

// ---------- ERROR LOG SCHEMA ----------

const errorLogSchema = new mongoose.Schema({
  'data aparitiei': {
    type: String,
  },
  'mesajul erorii': {
    type: String,
  },
  'datele introduse': {
    type: String,
  },
});

const ErrorLog = mongoose.model('Error', errorLogSchema);

// ---------- REGEX FOR THE NUMBER FORMAT ----------
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

// ---------- WRITE ERROR TO FILE ----------
async function writeErrorToDatabase(error, data) {
  const errorLog = new ErrorLog({
    'data aparitiei': new Date().toString(),
    'mesajul erorii': error.toString(),
    'datele introduse': JSON.stringify(data),
  });

  try {
    await errorLog.save();
  } catch (error) {
    rejects(error);
  }
}

// ---------- SEND WRONG FORMAT RESULT ----------
function sendWrongFormat(res) {
  res.send(
    'Numarul specificat nu corescunde formatului 07XXXXXXXX sau 7XXXXXXXX. Verificati.'
  );
}

// ---------- CREATE NEW ENTRY ----------
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

// ---------- APP REQUESTS ----------
app.get('/getAll', async (req, res) => {
  let resultToSend = { numere: '' };
  const telefonFilter = Person.find({}, 'telefon');
  const result = await telefonFilter.exec();
  result.forEach((object) => {
    resultToSend.numere = resultToSend.numere + object.telefon + ' ';
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
    if (error.code == 1100) {
      res.send('Numarul specificat exista deja in baza de date');
      return;
    } else {
      writeErrorToDatabase(error, req.body);
      res.send(
        'A aparut o eroare. Am colectat date despre aceasta. Contactati service support sau reveniti dupa verificarea datelor. Va multumim!'
      );
      return;
    }
  }
  res.send('Numarul a fost salvat');
});

app.post('/addTelefonNumbersAsStringOrObjects', async (req, res) => {
  let numberOfFailedEntries = 0;
  const { numere } = req.body.nameValuePairs;
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
  });

  async function saveItems(itemsToSave, res) {
    try {
      const result = await Person.bulkWrite(itemsToSave, { ordered: false });
      res.send('Numerele au fost salvate');
      return;
    } catch (error) {
      writeErrorToDatabase(error, req.body);
      res.send(
        `${numberOfFailedEntries} numere nu au fost salvate.  Am colectat date despre aceasta eroare. Contactati service support sau reveniti dupa verificarea datelor. Va multumim!`
      );
      return;
    }
  }

  saveItems(itemsToSave, res);
});

const port = process.env.PORT;

app.listen(port, function () {
  console.log('Server started on port ' + port);
});
