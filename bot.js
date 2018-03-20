let env = require('node-env-file');
env(__dirname + '/.env');

const usage_tip = () => {
  console.log('~~~~~~~~~~')
  console.log('Botkit Starter Kit')
  console.log('clientId=<MY SLACK CLIENT ID> clientSecret=<MY CLIENT SECRET> PORT=3000 studio_token=<MY BOTKIT STUDIO TOKEN> node bot.js')
  console.log('Get a Botkit Studio token here: https://studio.botkit.ai/')
  console.log('~~~~~~~~~~')
}

if (!process.env.clientId || !process.env.clientSecret || !process.env.PORT) {
  usage_tip()
  // process.exit(1);
}

let Botkit = require('botkit')
let debug = require('debug')('botkit:main')

let bot_options = {
  clientId: process.env.clientId || env.variables.clientId,
  clientSecret: process.env.clientSecret || env.variables.clientSecret,
  debug: true,
  scopes: ['bot'],
  studio_token: process.env.studio_token || env.variables.studio_token,
  studio_command_uri: process.env.studio_command_uri
}

// Use a mongo database if specified, otherwise store in a JSON file local to the app.
// Mongo is automatically configured when deploying to Heroku
if (process.env.MONGO_URI) {
  let mongoStorage = require('botkit-storage-mongo')({mongoUri: process.env.MONGO_URI})
  bot_options.storage = mongoStorage;
} else {
  bot_options.json_file_store = __dirname + '/.data/db/' // store user data in a simple JSON format
}

// Create the Botkit controller, which controls all instances of the bot.
let controller = Botkit.slackbot(bot_options)

controller.startTicking()

// Set up an Express-powered webserver to expose oauth and webhook endpoints
let webserver = require(__dirname + '/components/express_webserver.js')(controller)

if (!process.env.clientId || !process.env.clientSecret) {

  webserver.get('/', (req, res) => {
    res.render('installation', {
      studio_enabled: controller.config.studio_token ? true : false,
      domain: req.get('host'),
      protocol: req.protocol,
      glitch_domain:  process.env.PROJECT_DOMAIN,
      layout: 'layouts/default'
    })
  })
}else {

  webserver.get('/', (req, res) => {
    res.render('index', {
      domain: req.get('host'),
      protocol: req.protocol,
      glitch_domain:  process.env.PROJECT_DOMAIN,
      layout: 'layouts/default'
    })
  })
  // Set up a simple storage backend for keeping a record of customers
  // who sign up for the app via the oauth
  require(__dirname + '/components/user_registration.js')(controller)

  // Send an onboarding message when a new team joins
  require(__dirname + '/components/onboarding.js')(controller)

  // enable advanced botkit studio metric
  require('botkit-studio-metrics')(controller)

  let normalizedPath = require("path").join(__dirname, "skills")
  require("fs").readdirSync(normalizedPath).forEach((file) => {
    require("./skills/" + file)(controller)
  })

  // This captures and evaluates any message sent to the bot as a DM
  // or sent to the bot in the form "@bot message" and passes it to
  // Botkit Studio to evaluate for trigger words and patterns.
  // If a trigger is matched, the conversation will automatically fire!
  // You can tie into the execution of the script using the functions
  // controller.studio.before, controller.studio.after and controller.studio.validate
  if (process.env.studio_token) {
    controller.on('direct_message,direct_mention,mention', async (bot, message) => {
      let [err, convo] = await controller.studio.runTrigger(bot, message.text, message.user, message.channel, message)
      console.log(bot, message, err, convo)
      if (!convo) {
        
        // no trigger was matched
        // If you want your bot to respond to every message,
        // define a 'fallback' script in Botkit Studio
        // and uncomment the line below.
        controller.studio.run(bot, 'fallback', message.user, message.channel);
      } else {
        // set variables here that are needed for EVERY script
        // use controller.studio.before('script') to set variables specific to a script
        convo.setVar('current_time', new Date())
      }
      
      if(err){
        bot.reply(message, 'I experienced an error with a request to Botkit Studio: ' + err)
        debug('Botkit Studio: ', err)
      }else {
        console.log('~~~~~~~~~~')
        console.log('NOTE: Botkit Studio functionality has not been enabled')
        console.log('To enable, pass in a studio_token parameter with a token from https://studio.botkit.ai/')
      }
    })
  }
}