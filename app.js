require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const schedule = require('node-schedule');
const tokenGenerator = require('token-generator')({
    salt: process.env.SALT,
    timestampMap: process.env.TOKENPASS, // 10 chars array for obfuscation proposes
});

const app = express();
const port = process.env.PORT;

// Development
const pool = new Pool({
    user: process.env.PGUSER,
    host: 'localhost',
    database: process.env.PGDATABASE,
    password: process.env.PGPASS,
    port: 5432,
});

var transporter = nodemailer.createTransport({
  host: 'srv-plesk50.ps.kz',
//   secure: true,
  auth: {
    user: 'til.sozdik@samgau.org.kz',
    pass: process.env.MAILPASS
  }
});


function sendEmail (receiver, subject, text){
    var mailOptions = {
        from: 'til.sozdik@samgau.org.kz',
        to: receiver,
        subject: subject,
        html: text
    };
    transporter.sendMail(mailOptions, function(error, info){
      if (error) {
        console.log(error);
		return error;
      } else {
        console.log('Email sent: ' + info.response);
		return 'success';
      }
    });
};

app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(cookieParser());
app.use(
    session({
        secret: process.env.SECRET,
        resave: false,
        saveUninitialized: true,
    })
);
var salt = process.env.SALT;
app.use(function (req, res, next) {
  res.locals.user = req.session;
  next();
});
let loginRegister = '/dictionary';

app.set('view engine', 'ejs');

// Home
app.get('/', (req, res) => {
    res.render('home');
});

// Login
app.get('/login', (req, res) => {
    if (req.session.userId) {
        res.redirect(loginRegister);
	} else {
        var error = req.cookies.error;
        res.cookie("error", undefined);
    	res.render('login', { error: error });
	};
});

app.post('/login', async (req, res) => {
    if (req.session.userId) {
        return res.redirect(loginRegister);
	};
    let { loginusername, loginpassword } = req.body;
    loginusername = loginusername.toLowerCase().replace(/[^a-zA-Z0-9!@#$%^*_|]/g, '');
    const result = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [
        loginusername,
        bcrypt.hashSync(loginpassword, salt),
    ]);

    if (result.rows.length > 0) {
        const user = result.rows[0];
        req.session.userId = user.id;
        req.session.username = user.username;
        req.session.firstname = user.firstname;
        req.session.lastname = user.lastname;
        req.session.phone = user.phone;
        req.session.email = user.email;
        req.session.userlevel = parseFloat(user.userlevel);
        req.session.emailverified = user.emailverified;
        req.session.private = user.private;
        req.session.registrationDate = user.registrationDate;
        res.redirect(req.session.emailverified == true ? loginRegister : `/profile/${req.session.username}`);
    } else {
        res.cookie('error', 'noauth');
        res.redirect('/login');
    };
});

// Register
app.get('/register', (req, res) => {
    if (req.session.userId) {
        res.redirect(loginRegister);
	} else {
        var error = req.cookies.error;
        res.cookie("error", undefined);
    	res.render('register', { error: error });
	};
});
let verifyEmailTokens = [];
app.post('/register', async (req, res) => {
    if (req.session.userId) {
        return res.redirect(loginRegister);
	};
    let { regisusername, regispassword, firstname, lastname, phone, email } = req.body;
    regisusername = regisusername.toLowerCase().replace(/[^a-zA-Z0-9!@#$%^*_|]/g, '');
    email = email.toLowerCase();

    // Check if the username is already taken
    const existingUser = await pool.query('SELECT * FROM users WHERE username = $1', [regisusername]);
    if (existingUser.rows.length > 0) {
        res.cookie('error', 'userexists');
        return res.redirect('/register');
    };

    const existingEmail = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (existingEmail.rows.length > 0) {
        res.cookie('error', 'userexists');
        return res.redirect('/register');
    };
    
    // Insert the new user into the database
    const registrationDate = new Date();
    await pool.query('INSERT INTO users (username, password, firstname, lastname, phone, email, registrationdate) VALUES ($1, $2, $3, $4, $5, $6, $7)', [regisusername, bcrypt.hashSync(regispassword, salt), firstname, lastname, phone, email, registrationDate]);
    registrationDate.setDate(registrationDate.getDate() + 3);
    let token = tokenGenerator.generate();
    verifyEmailTokens.push({token: token, email: email});
    sendEmail(email, 'Электронды почтаңызды растауға линк. ', `Электронды почтаңызды растау үшін осы <a href="https://www.samgau.org.kz/verify/email/${token}">линкты</a> басыңыз. <br> - ТІЛsozdik`);
    schedule.scheduleJob(registrationDate, async () => {
        await pool.query('UPDATE users SET userlevel = 1 WHERE username = $1', [regisusername]);
        console.log("User passed date requirement! ");
    });
    res.redirect(loginRegister);
});

app.get('/resendemailver', async (req, res) => {
    if (!req.session.userId) {
        res.cookie('error', 'authneeded');
    	return res.redirect("/login");
	};
    let tokenElement = verifyEmailTokens.find(element => element.email === req.session.email);

    if (!tokenElement) {
        let token = tokenGenerator.generate();
        verifyEmailTokens.push({ token: token, email: req.session.email });
        sendEmail(req.session.email, 'Электронды почтаңызды растауға линк. ', `Электронды почтаңызды растау үшін осы <a href="https://www.samgau.org.kz/verify/email/${token}">линкты</a> басыңыз. <br> - ТІЛsozdik`);
    } else {
        let token = tokenElement.token;
        sendEmail(req.session.email, 'Электронды почтаңызды растауға линк. ', `Электронды почтаңызды растау үшін осы <a href="https://www.samgau.org.kz/verify/email/${token}">линкты</a> басыңыз. <br> - ТІЛsozdik`);
    }

    res.cookie("error", "emailresent");
    res.redirect(`/profile/${req.session.username}`);
});

app.get('/verify/email/:token', async (req, res) => {
    if (!req.session.userId) {
        res.cookie('error', 'authneeded');
    	return res.redirect("/login");
	};
    const token = req.params.token;

    // Check if the token is valid
    if (tokenGenerator.isValid(token)) {
        const index = verifyEmailTokens.findIndex(element => element.token === token);

        // Check if the index was found
        if (index !== -1) {
            const userEmail = verifyEmailTokens[index].email;

            // Update the database to mark the user's email as verified
            await pool.query('UPDATE users SET emailverified=true WHERE email = $1', [userEmail]);
            req.session.emailverified = true;

            // Remove the token from the verifyEmailTokens array
            verifyEmailTokens.splice(index, 1);

            // Redirect to profile page
            res.cookie('emailwasverified');
            return res.redirect(`/profile/${req.session.username}`);
        }
    }

    // Redirect to home
    res.redirect('/'); 
});

// Reset password
app.get('/reset/password', (req, res) => {
    res.render("reset-password");
});
app.post('/reset/password/code', (req, res) => {
    res.render("reset-password-code");
});
app.post('/reset/password', (req, res) => {
    res.redirect("/login");
});

// Logout
app.get('/logout', (req, res) => {
    if (!req.session.userId) {
        return res.redirect(loginRegister);
	};
    req.session.destroy((err) => {
        if (err) {
            console.error('Error destroying session:', err);
        };
        res.redirect(loginRegister);
    });
});

// Profile
app.get('/profile/edit', async (req, res) => {
    if (!req.session.userId) {
        res.cookie('error', 'authneeded');
    	return res.redirect("/login");
	};
    var error = req.cookies.error;
    res.cookie("error", undefined);
    res.render('editprofile', {error: error});
});
app.post('/profile/edit', async (req, res) => {
    if (!req.session.userId) {
        res.cookie('error', 'authneeded');
    	return res.redirect("/login");
	};
    let { firstname, lastname, phone, email, private } = req.body;
    email = email.toLowerCase();

    const existingEmail = await pool.query('SELECT * FROM users WHERE email=$1 AND username!=$2', [email, req.session.username]);
    if (existingEmail.rows.length > 0) {
        res.cookie('error', 'emailregistered');
        return res.redirect('/profile/edit');
    };

    let emailverified = req.session.emailverified;
    if (req.session.email != email){
        emailverified = false;
        let token = tokenGenerator.generate();
        verifyEmailTokens.push({token: token, email: email});
        sendEmail(email, 'Электронды почтаңызды растауға линк. ', `Электронды почтаңызды растау үшін осы <a href="https://www.samgau.org.kz/verify/email/${token}">линкты</a> басыңыз. <br> - ТІЛsozdik`);
    };
    if (private != 'on') {
        private = false;
    } else if (private == 'on'){
        private = true;
    };
    await pool.query('UPDATE users SET firstname=$1, lastname=$2, phone=$3, email=$4, private=$5, emailverified=$6 WHERE username=$7', [firstname, lastname, phone, email, private, emailverified, req.session.username]);
    req.session.firstname = firstname;
    req.session.lastname = lastname;
    req.session.phone = phone;
    req.session.email = email;
    req.session.emailverified = emailverified;
    req.session.private = private;
    res.redirect(`/profile/${req.session.username}`);
});

app.get('/profile/:userLookedUp', async (req, res) => {
    var error = req.cookies.error;
    res.cookie("error", undefined);
    let userLookedUp = req.params.userLookedUp;
    userLookedUp = userLookedUp.toLowerCase();
    let result = await pool.query('SELECT username, firstname, lastname, userlevel, private FROM users WHERE username=$1 ', [userLookedUp]);
    let resultTwoPointOh;
    if (userLookedUp == req.session.username || (result.rows.length != 0 && result.rows[0].private == false)) {
        resultTwoPointOh = await pool.query('SELECT * FROM dictionary WHERE author=$1 ', [userLookedUp]);
    };
    res.render('profile', {userLookedUp: result.rows, error: error, wordss: resultTwoPointOh});
});

// Dictionary
app.get('/dictionary', async (req, res) => {
    var error = req.cookies.error;
    res.cookie("error", undefined);
    let result = await pool.query('SELECT * FROM dictionary ORDER BY word ASC LIMIT 50;');
    res.render('words', {words: result.rows, error: error});
});

app.get('/dictionary/new', (req, res) => {
    if (req.session.userId && req.session.emailverified && req.session.userlevel >= 2) {
        var error = req.cookies.error;
        res.cookie("error", undefined);
        let word = req.params.word || '';
        res.render('newword', { error: error, word: word });
	} else if (req.session.userlevel < 2) {
        res.cookie('error', 'needtobemod');
    	res.redirect("/dictionary");
	} else if (req.session.userId) {
        res.cookie('error', 'emailnotverified');
    	res.redirect("/profile/" + req.session.username);
	} else {
        res.cookie('error', 'authneeded');
    	res.redirect("/login");
	};
});
app.get('/dictionary/new/:word', async (req, res) => {
    if (req.session.userId && req.session.emailverified && req.session.userlevel >= 2) {
        let newWord = req.params.word;
        newWord = newWord.toLowerCase();
        newWord = newWord.charAt(0).toUpperCase() + newWord.slice(1);
        const existingUser = await pool.query('SELECT * FROM dictionary WHERE word = $1', [newWord]);
        if (existingUser.rows.length > 0) {
            res.cookie('error', 'wordexists');
            return res.redirect('/dictionary/new');
        };
        var error = req.cookies.error;
        res.cookie("error", undefined);
        let word = req.params.word || '';
        res.render('newword', { error: error, word: word });
	} else if (req.session.userlevel < 2) {
        res.cookie('error', 'needtobemod');
    	res.redirect("/dictionary");
	} else if (req.session.userId) {
        res.cookie('error', 'emailnotverified');
    	res.redirect("/profile/" + req.session.username);
	} else {
        res.cookie('error', 'authneeded');
    	res.redirect("/login");
	};
});
app.post('/dictionary/new', async (req, res) => {
    if (!req.session.userId){
        res.cookie('error', 'authneeded');
        return res.redirect("/login");
    } else if (req.session.userlevel < 2) {
        res.cookie('error', 'needtobemod');
    	res.redirect("/dictionary");
	} else if (!req.session.emailverified) {
        res.cookie('error', 'emailnotverified');
    	res.redirect("/profile/" + req.session.username);
    } else {
        if (req.body.meaning.length < '80') {
            res.cookie('error', 'meaningtooshort');
            return res.redirect(`/dictionary/new/${req.body.word}`);
        };
        let newWord = req.body.word;
        newWord = newWord.toLowerCase();
        newWord = newWord.charAt(0).toUpperCase() + newWord.slice(1);
        const existingUser = await pool.query('SELECT * FROM dictionary WHERE word = $1', [newWord]);

        if (existingUser.rows.length > 0) {
            res.cookie('error', 'wordexists');
            return res.redirect('/dictionary/new');
        };
        let date = new Date().toISOString().split('T')[0];
        await pool.query('INSERT INTO dictionary (word, meaning, author, date) VALUES ($1, $2, $3, $4)', [newWord, req.body.meaning, req.session.username, date]);
        await pool.query("UPDATE users SET userlevel=$1 WHERE username=$2", [req.session.userlevel + ((0.02 / (2**Math.floor(req.session.userlevel))) * 2), req.session.username]);
        req.session.userlevel = req.session.userlevel + ((0.02 / (2**Math.floor(req.session.userlevel))) * 2);
        res.redirect(`/dictionary/${newWord}`);
    };
});

app.get('/dictionary/phrases', (req, res) => {
    res.send("In development");
});

app.get('/dictionary/:word', async (req, res) => {
    let searchWord = req.params.word;
    searchWord = searchWord.toLowerCase();
    searchWord = searchWord.charAt(0).toUpperCase() + searchWord.slice(1);
    let result = await pool.query('SELECT * FROM dictionary WHERE word = $1', [searchWord]);
    if (result.rows.length > 0){
        res.render('word', {word: result.rows[0]});
    } else {
        let word = {word: req.params.word, meaning: `Бұл сөзге мағына берілмеген. <a href="/dictionary/new/${req.params.word}" class="link-primary">Осы сілтеме</a> арқылы жаңа сөзді енгізуге болады. `, author: 'ТІЛsozdik'}
        res.render('word', {word: word});
    };
});

app.get('/dictionary/:word/verify', async (req, res) => {
    if (!req.session.userId){
        res.cookie('error', 'authneeded');
        return res.redirect("/login");
    } else if (req.session.userlevel < 3) {
        res.cookie('error', 'needtobemod');
    	res.redirect("/dictionary");
	} else if (!req.session.emailverified) {
        res.cookie('error', 'emailnotverified');
    	res.redirect("/profile/" + req.session.username);
    } else {
        let searchWord = req.params.word;
        searchWord = searchWord.toLowerCase();
        searchWord = searchWord.charAt(0).toUpperCase() + searchWord.slice(1);
        let result = await pool.query('SELECT * FROM dictionary WHERE word = $1', [searchWord]);
        if (result.rows.length > 0){
            await pool.query('UPDATE dictionary SET verified=true WHERE word = $1', [searchWord]);
            await pool.query("UPDATE users SET userlevel=$1 WHERE username=$2", [req.session.userlevel + (0.02 / (2**Math.floor(req.session.userlevel))), req.session.username]);
            req.session.userlevel = req.session.userlevel + (0.02 / (2**Math.floor(req.session.userlevel)));
            res.redirect(`/dictionary/${searchWord}`);
        } else {
            res.redirect(`/dictionary/${searchWord}`);
        };
    };
});

app.get("/dictionary/:word/history", async (req, res) => {
    let searchWord = req.params.word;
    searchWord = searchWord.toLowerCase();
    searchWord = searchWord.charAt(0).toUpperCase() + searchWord.slice(1);
    let result = await pool.query('SELECT * FROM dictionary WHERE word = $1', [searchWord]);
    if (result.rows.length > 0){
        res.render('history', {word: result.rows[0]});
    } else {
        res.redirect(`/dictionary/${req.params.word}`);
    };
});

app.get("/dictionary/:word/edit", async (req, res) => {
    if (!req.session.userId){
        res.cookie('error', 'authneeded');
        return res.redirect("/login");
    } else if (!req.session.emailverified) {
        res.cookie('error', 'emailnotverified');
    	res.redirect("/profile/" + req.session.username);
    } else if (req.session.userlevel < 1) {
        res.cookie('error', 'needtobemod');
    	res.redirect("/dictionary");
	} else {
        var error = req.cookies.error;
        res.cookie("error", undefined);
        let word = req.params.word;
        word = word.toLowerCase();
        word = word.charAt(0).toUpperCase() + word.slice(1);
        let result = await pool.query('SELECT * FROM dictionary WHERE word = $1', [word]);
        if (result.rows.length > 0){
            var error = req.cookies.error;
            res.cookie("error", undefined);
            res.render('edit', {word: result.rows[0], error: error});
        } else {
            res.redirect(`/dictionary/${word}`);
        };
    };
});

app.post('/dictionary/:word/edit', async (req, res) => {
    if (!req.session.userId){
        res.cookie('error', 'authneeded');
        return res.redirect("/login");
    } else if (!req.session.emailverified) {
        res.cookie('error', 'emailnotverified');
    	res.redirect("/profile/" + req.session.username);
    } else if (req.session.userlevel < 1) {
        res.cookie('error', 'needtobemod');
    	res.redirect("/dictionary");
	} else {
        if (req.body.meaning.length < '80') {
            res.cookie('error', 'meaningtooshort');
            return res.redirect(`/dictionary/${req.params.word}/edit`);
        };
        let word = req.params.word;
        word = word.toLowerCase();
        word = word.charAt(0).toUpperCase() + word.slice(1);
        let result = await pool.query('SELECT * FROM dictionary WHERE word = $1', [req.params.word]);
        if (result.rows.length > 0){
            if (req.body.word != undefined){
                if (req.body.word != req.params.word && req.session.userlevel <= 4) {
                    res.cookie('error', 'needtobemod');
                    return res.redirect(`/dictionary/${word}/edit`);
                };
            };
            if (req.session.userlevel >= 5 && req.body.delete == "true" ) {
                await pool.query("UPDATE users SET userlevel = CAST(userlevel AS numeric) - 0.1 WHERE username=$1", [result.rows[0].author]);
                await pool.query('DELETE FROM dictionary WHERE word=$1', [req.params.word]);
                await pool.query("UPDATE users SET userlevel=$1 WHERE username=$2", [req.session.userlevel + ((0.02 / (2**Math.floor(req.session.userlevel))) * 0.5), req.session.username]);
                req.session.userlevel = req.session.userlevel + ((0.02 / (2**Math.floor(req.session.userlevel))) * 0.5);
                res.redirect(`/dictionary`);
            } else {
                let history = {word: result.rows[0].word, meaning: result.rows[0].meaning, author: result.rows[0].author, date: result.rows[0].date};
                let date = new Date().toISOString().split('T')[0];
                await pool.query('UPDATE dictionary SET word=$1, meaning=$2, history=array_append(history, $3), verified=false, date=$5, author=$6 WHERE word=$4', [req.body.word || word, req.body.meaning, history, req.params.word, date, req.session.username]);
                await pool.query("UPDATE users SET userlevel=$1 WHERE username=$2", [req.session.userlevel + (0.02 / (2**Math.floor(req.session.userlevel))), req.session.username]);
                req.session.userlevel = req.session.userlevel + (0.02 / (2**Math.floor(req.session.userlevel)));
                res.redirect(`/dictionary/${req.body.word || word}`);
            };
        } else {
            res.redirect(`/dictionary/${req.params.word}`);
        };
    };
});



// Search
app.get('/search/dictionary', async (req, res) => {
    res.render('searchresults', {words: [], wordsearched: ''});
});

app.get('/search/dictionary/:word', async (req, res) => {
    let searchWord = req.params.word;
    searchWord = searchWord.toLowerCase();
    searchWord = searchWord.charAt(0).toUpperCase() + searchWord.slice(1);
    let result = await pool.query(`SELECT * FROM dictionary WHERE word LIKE '${searchWord}%'`);
    res.render('searchresults', {words: result.rows, wordsearched: searchWord});
});

// Extra Info URLs'
app.get('/developer-log', (req, res) => {
    res.render('developerlog');
});

app.get('/contact', (req, res) => {
    res.render('contact');
});

// Query
app.get('/query', (req, res) => {
    if (!req.session.userId || req.session.userlevel < 5) return res.redirect("/");
	res.render('query');
});

app.post('/query', async (req, res) => {
    if (!req.session.userId || req.session.userlevel < 5) return res.redirect("/");
	let result = await pool.query(req.body.query);
    if (req.body.query.toLowerCase().includes("select")) {
        res.send(result.rows);
    } else {
	    res.redirect("/logout");
    };
});

app.get("*", (req, res) => {
    res.status(404).render('404notfound');
});

//Start Server
app.listen(port, function(){
  console.log("Server started on port " + port);
});
