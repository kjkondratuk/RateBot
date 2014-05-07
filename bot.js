// Create the configuration
var config = {
  channels: ["#CHANNELNAMEHERE"],
  server: "SERVERNAME",  // irc.freenode.net or similar
  botName: "BOTNAME",
  userName: "BOTNAME",
  password: "PASSWORD",
  secure: true,
  autoRejoin: true,
  autoConnect: true,
  repLimit: 3,          // limit for the number of times users can rep in one day
  realName: "BOTNAME",
  database: "DATABASE"  // mongodb database to point to
};
var irc = require("irc");
var request = require("request");
var os = require("os");
var fs =  require("fs");
var mongoose = require("mongoose");
mongoose.connect("mongodb://localhost/" + config.database);
var db = mongoose.connection;
var Schema = mongoose.Schema;

// Create Global Config Variables
var machine = "DigitalStorm Hailstorm";
var maintainer = "BallmerPeak";

// Create the bot name
var bot = new irc.Client(config.server, config.botName, {
    autoConnect: config.autoConnect,
    channels: config.channels,
    userName: config.userName,
    realName: config.realName,
    autoRejoin: config.autoRejoin,
    password: config.password
  });

//Log Errors instead of Crashing "Hopefully" (TM)
bot.addListener('error', function(message) {
  console.log('error: ', message);
});
// END load word database

// Start About Command
bot.addListener('message', function (from, to, message) {

// handle about
  if(message == "?about") {
    bot.say(from, "Commands:");
    bot.say(from, "Use me to grand rep points to your friends when they help you out!  The following");
    bot.say(from, "are commands you can use to interact with me!");
    bot.say(from, "   ?rep [username]    --->     print the rep points for 'username'");
    bot.say(from, "   +rep [username]    --->     add a rep point for 'username'");
    bot.say(from, "   ?toprep            --->     print the current leaderboard");
    bot.say(from, "   ?repby [username]  --->     receive a pm of users who have repped this user");
    bot.say(from, " **NOTE** ONLY 3 +rep(s) per day!");
  }
// end handle about

// handle adding rep
  if(message.substring(0, 4) == "+rep") {
    if(message.length > 4) {
      var username = message.split(" ")[1];

      // if this person is not repping his/herself
      if(username != from) {

        // limit rep number to three within 24 hours
        getUserRepsForRepLimit(from, function(err, recentReps) {

          var dateLimit = new Date();
          dateLimit.setDate(dateLimit.getDate() - 1)

          // check if at least one of the reps is older than a day, if so, we can add more rep by this person
          var violations = 0;
          for(x in recentReps) {
            if(recentReps[x].date >= dateLimit) {
              violations ++;
            }
          }

          if(violations < config.repLimit) {
            // create rep entry
            var newRep = new Rep({ date: new Date(), username: username, by: from });

            // insert the new rep entry
            newRep.save(function(err) {
              if(err) {
                console.log("There was an error inserting rep for " + username);
              } else {
                bot.say(to, from + " gave " + username + " a rep point!");

                // display how many reps this person now has
                Rep.count({username: username}, function(err, count) {
                  if(err) {
                    console.log("error retrieving rep for " + username);
                  } else {
                    bot.say(to, username + " now has " + count + " rep!");
                  }
                });
              }
            });
          } else {
            bot.say(to, "You have reached your rep cap for the day.  You can only grant " + config.repLimit + " rep points per day.");
          }
        });
      } else {
        bot.say(to, "Nice try.  You can't rep yourself.");
      }
    } else {
      bot.say(to, "If you wish to +rep someone, please use the format: +rep [username]");
    }
  }
// end handle adding rep

// start handle rep query
  if(message.substring(0, 4) == "?rep") {
    if(message.split(" ")[0].toString().length == 4) {
      if(message.length > 4) {
        var username = message.split(" ")[1];

        // display how many reps this person now has
        Rep.count({username: username}, function(err, count) {
          if(err) {
            bot.say(to, "Could not find user: " + username);
          } else {
            bot.say(to, username + " has " + count + " rep points!");
          }
        });
      } else {
        bot.say(from, "If you wish to ?rep someone, please use the format: ?rep [username]");
      }
    }
  }
// end handle rep query

// handle toprep (get leaderboard) command
  if(message.substring(0, 7) == "?toprep") {

    // create parameter set for mongoose native
    var group = {
      key: {username: true},
      initial: {sum: 0},
      reduce: function(doc, prev) {
        prev.sum += 1;
      }
    };

    // execute grouped count using native mongodb method due to nonexistent $group documentation
    Rep.collection.group(group.key, {}, group.initial, group.reduce, {}, true, function(err, results) {
      if(err) {
        console.log("Could not retrieve leaderboard.");
      } else {

        var pairs = [];
        // print the leaderboard in columnar block format
        bot.say(from, "Leaderboard --------------------------------------");

        for(x in results) {
          //var count = results[x].sum.toString();
          var count = results[x].sum;
          //var mask =  "----------------------- has ----------------------"

          // format lines correctly taking into account username length
          //mask = "- " + results[x].username + " " + mask.substring(
          //    results[x].username.length + 3, mask.length - count.length - 1) + " " + count;

          pairs.push({sum: count, name: results[x].username});

          //bot.say(from, mask);
        }

        // sort name/count pairs into logical order
        pairs = pairs.sort(function(first, second) {
          if(first.sum > second.sum || first.sum < second.sum) {
            return second.sum - first.sum;                  // primary sort on count/sum
          } else {
            return first.name.toUpperCase().localeCompare(second.name.toUpperCase());   // secondary count on name (tiebreaker)
          }
        });

        // print top 10 results
        for(i in pairs) {
          if(i < 10) {
            var mask =  "----------------------- has ----------------------"
            bot.say(from, "- " + pairs[i].name + " " + mask.substring(
                pairs[i].name.length + 3, mask.length - pairs[i].sum.toString().length - 1) + " " + pairs[i].sum);
          } else {
            break;
          } 
        }

        bot.say(from, "--- End ------------------------------------------");
      }
    });
  }
// end handle toprep

//handle repby (display all people who have repped this person)
  if(message.substring(0, 6) == "?repby") {
    var username = message.split(" ")[1];

    Rep.find({username: username}).distinct("by", function(err, result) {
      if(err) {
        console.log("Unable to resolve unique reps.");
      }

      var repByString = "";
      for(x in result) {
        if(repByString == "") {
          repByString = result[x];
        } else {
          repByString += ", " + result[x];
        }
      }

      bot.say(from, username + " has been repped by: " + repByString);
    });
  }

});
// end repby

// when/if the database is opened successfully, log it
db.once("open", function() {
  console.log("--- Connected to database");
});

// notify of database close
db.on("close", function() {
  console.log("--- Disconnecting from database");
});

// on error, log the error
db.on("error", console.error.bind(console, "connection error: "));

//**********************************************************************************
// ******************** CREATE DATA MODELS AND SCHEMAS *****************************
//**********************************************************************************
var repSchema = new Schema({
  date: Date,
  username: String,
  by: String,
}, {collection: 'rep'});

var Rep = mongoose.model('rep', repSchema);

//********************* END DATA MODELS AND SCHEMAS ********************************

// retrieve a user's last three reps given by a user (to determine if this user
// has repped too many times in a single day)
function getUserRepsForRepLimit(username, callback) {
  Rep.find({by: username}).sort("-date").limit(config.repLimit).exec(callback);
}
