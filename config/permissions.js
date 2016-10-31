function permissionHandler(bot, serverID){
  var permissions = require('./permissions.json');
  var commands = require('./commands.json');
  var enabled = true;

  // Check if there is an entry in the permissions file for the server.
  if (typeof permissions.servers[serverID] === 'undefined') {
    enabled = false;
    //console.log(bot.servers);
    //console.log(serverID);
    log("Server: " + bot.servers[serverID].name + " has not been configured for permissions.");
  }

  if (!permissions.servers[serverID] || !permissions.servers[serverID].permissionsEnabled) {
    enabled = false;
    log("Server has permissions disabled.");
  }

  // Checks if the user has plain access to the core command.
  this.hasAccess = function(userID, command){
    // if (!enabled)

    // Check that the command is configured for permissions.
    if (typeof commands[command] === 'undefined' || !enabled){
      log('Failed to check for command access. Command Defined: ' + typeof commands[command] + ' enabled: ' + enabled);

      // Return default true if access level required is 3 or less.
      // This is the default case, when servers have not set up permissions.
      try {
        if (!enabled) {
          if (commands[command].access <= 3){
            return {
              result: true,
              reason: null
            };
          } else {
            return {
              result: false,
              reason: "Using this command requires permissions setup."
            };
          }
        };
      } catch(e){ log('Checking for cmd access: ' + e)}

      // If the command does not exist in permissions (i.e. has not been configured)
      // but premissions is enabled, allow only bot-master to use.
      if (typeof commands[command] === 'undefined'){

        try {
          var accessLevel6Role = permissions.servers[serverID].assignment['6'].id;
        } catch(e){ log('No cmd setup acccess 6 checker: ' + e)}
        if (hasSufficientRole(userID, accessLevel6Role)){
          return {
            result: true
          };
        } else {

          return {
            result: false,
            reason: "Permissions not configured for this command.\nOnly bot-master can use it until it is configured."
          };
        }

      }

    } // End of check for partial / not configured permissions or cmd-specific permissions.

    // Handle for commands that are registed, and permissions are enabled.
    var commandAccessLevel = commands[command].access;

    var requiredRoleForAccessLevel = permissions.servers[serverID].assignment[commandAccessLevel]; // Append ID
    //console.log('Checked required role for access level');

    if (!hasSufficientRole(userID, requiredRoleForAccessLevel.id)){
      // User does not have requried permission.
      return {
        result: false,
        reason: "You need access level "+commandAccessLevel+", as part of role: `" +
        requiredRoleForAccessLevel.name +
        "` to use this. Your access level is " + getAccessLevel(userID) + "."
      };
    } else {
      // User has permission to use command.
      return {
        result: true,
        reason: null
      }
    }


  }

  // Checks if the user has scope to access feature of a command.
  this.hasScope = function(userID, command, scope){
    // Return false if any arguments are undefined.
    if (!userID || !command || !scope){
      return {
        result: false,
        reason: "Undefined arguments."
      }
    };

    // Check if user has access to the core command first.
    var hasAccessCached = hasAccess(userID, command);
    if (!hasAccessCached.result){
      return {
        result: hasAccessCached.result,
        reason: bot.users[userID].name + ": " + userID+" does not have access to that command.\n"+hasAccessCached.reason
      }
    }

    // Assuming that the user does have access, check the scope availability.
    var commandScopes = commands[command].scope;

    // Return true if the command does not have any scopes and user meets access-level.
    if (commandScopes === 'none' || !commandScopes) return {result: true, reason: 'No scopes set for command.'};

    // Check available scopes;
    var usersAccessLevel = getAccessLevel(userID);

    var reverseScopeLookup = {};

    // Creates a keyword - access level dictionary
    // to convert the 'scope' argument into an access level number
    // that can be compared.
    for (var key in commandScopes){
      var scopeKeyword = commandScopes[key];
      reverseScopeLookup[scopeKeyword] = key;
    }

    var desiredAccessLevel = reverseScopeLookup[scope]; // This saves the access level desired for the query.

    if (usersAccessLevel >= desiredAccessLevel){
      return {
        result: true,
        reason: null
      }
    } else {
      return {
        result: false,
        reason: 'Access level: ' + desiredAccessLevel + ' required, while user only has level: ' + usersAccessLevel
      }
    }

  }

  // Given the roles a user has, this returns the highest access
  // level for that user.
  function getAccessLevel(userID){
    try {
      var userRoles = bot.servers[serverID].members[userID].roles;

      var roleLookupToRank = {};

      for (var key in permissions.servers[serverID].assignment){
        roleLookupToRank[permissions.servers[serverID].assignment[key].id] = key;
      }

      var highestAccessLevel = 0;

      for (var i = 0; i < userRoles.length; i++){
        var cur = userRoles[i];
        if (!roleLookupToRank[cur]) continue;

        if (roleLookupToRank[cur] > highestAccessLevel){
          highestAccessLevel = roleLookupToRank[cur];
        }
      }

      return highestAccessLevel;

    } catch(e){ log('Aquiring Access level: ' + e); return 0;}
  }

  function hasSufficientRole(userID, role){
    // This grabs the user's roles, and returns true if user
    // has a role at same rank level as argued role or higher.

    try {
      var userRoles = bot.servers[serverID].members[userID].roles;

      var roleLookupToRank = {};

      for (var key in permissions.servers[serverID].assignment){
        roleLookupToRank[permissions.servers[serverID].assignment[key].id] = key;
      }

      //var highestRole = roleLookupToRank[0].id;
      var highestRole = permissions.servers[serverID].assignment[0].id;

      //console.log(roleLookupToRank);
      // Loop through user Roles, finding the highest role.
      for (var i = 0; i < userRoles.length; i++){
        var cur = userRoles[i];

        // Skip iteration if the role is not a ranked perm role.
        if (!roleLookupToRank[cur]) continue;

        if (roleLookupToRank[cur] > roleLookupToRank[highestRole]){
          highestRole = cur;
        }

      }

      // If the user has no roles, returns lowest role by default.
      return roleLookupToRank[highestRole] >= roleLookupToRank[role];

    } catch(e){ log('Getting Highest Role: ' + e); return false; }
  }


  function updatePermissions(){
    //updates the rank-enabled role names for the server.
    var rankRoles = permissions.servers[serverID].assignment;

    for (var key in rankRoles){
      var currentRoleID = rankRoles[key].id;
      rankRoles[key].name = bot.servers[serverID].roles[currentRoleID].name;
    };

  }

  function log(x){
    console.log('[PERMISSION HANDLER] ' + x)
  }

}

module.exports = permissionHandler;