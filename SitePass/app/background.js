"use strict";
var Consts = {
    xClientHeader: "5a8238ab-1819-4f7f-a750-f23264719a2d-HabiticaPomodoroSiteKeeper",
    serverUrl: 'https://habitica.com/api/v3/',
    serverPathUser: 'user/',
    serverPathTask: 'tasks/sitepass',
    serverPathPomodoroHabit: 'tasks/sitepassPomodoro',
    serverPathPomodoroSetHabit: 'tasks/sitepassPomodoroSet',
    serverPathUserTasks: 'tasks/user',
    serverPathUserHabits: 'tasks/user?type=habits',
    RewardTemplate: {
        text: "SitePass",
        value: 0,
        notes: "Reward utilized by Habitica SiteKeeper." +
            " Changes value depending on last accessed website.",
        alias: "sitepass",
        type: "reward"
    },
    PomodoroHabitTemplate: {
        text: ":tomato: Pomodoro",
        type: "habit",
        alias: "sitepassPomodoro",
        notes: "Habit utilized by Habitica SiteKeeper. " +
            "Change the difficulty manualy according to your needs.",
        priority: 1
    },
    PomodoroSetHabitTemplate: {
        text: ":tomato::tomato::tomato: Pomodoro Combo!",
        type: "habit",
        alias: "sitepassPomodoroSet",
        notes: "Habit utilized by Habitica SiteKeeper. " +
            "Change the difficulty manualy according to your needs.",
        down: false,
        priority: 1.5
    },
    userDataKey: "USER_DATA",
    PomodorosTodayDataKey: "PomodorosToday",
    NotificationId: "sitepass_notification"
};

var Vars = {
    EditingSettings: false,
    RewardTask: Consts.RewardTemplate,
    PomodoroTaskId: null,
    PomodoroSetTaskId: null,
    PomodoroTaskCustomList: [],
    PomodorosToday: {
        value: 0,
        date: 0
    },
    Monies: 0,
    Exp: 0,
    Hp: 0,
    UserData: new UserSettings(),
    ServerResponse: 0,
    Timer: "00:00",
    TimerValue: 0, //in seconds
    TimerRunnig: false,
    onBreak: false,
    onBreakExtension: false,
    PomoSetCounter: 0,
    onManualTakeBreak: false
};


function UserSettings(copyFrom) {
    //Get User Setting from copyFrom , or set default user settings
    this.BlockedSites = copyFrom ? copyFrom.BlockedSites : {};
    this.Credentials = copyFrom ? copyFrom.Credentials : {
        uid: "",
        apiToken: ""
    };
    this.PassDurationMins = copyFrom ? copyFrom.PassDurationMins : 30;
    this.PomoDurationMins = copyFrom ? copyFrom.PomoDurationMins : 25;
    this.PomoHabitPlus = copyFrom ? copyFrom.PomoHabitPlus : false; //Hit + on habit when pomodoro done
    this.PomoHabitMinus = copyFrom ? copyFrom.PomoHabitMinus : false; //Hit - on habit when pomodoro is interupted
    this.BreakDuration = copyFrom ? copyFrom.BreakDuration : 5;
    this.ManualBreak = copyFrom ? copyFrom.ManualBreak : true;
    this.BreakFreePass = copyFrom ? copyFrom.BreakFreePass : false;
    this.BreakExtention = copyFrom ? copyFrom.BreakExtention : 2;
    this.BreakExtentionFails = copyFrom ? copyFrom.BreakExtentionFails : false;
    this.BreakExtentionNotify = copyFrom ? copyFrom.BreakExtentionNotify : false;
    this.SoundNotify = copyFrom ? copyFrom.SoundNotify : true;
    this.PomoSetNum = copyFrom ? copyFrom.PomoSetNum : 4;
    this.PomoSetHabitPlus = copyFrom ? copyFrom.PomoSetHabitPlus : false;
    this.LongBreakDuration = copyFrom ? copyFrom.LongBreakDuration : 30;
    this.LongBreakNotify = copyFrom ? copyFrom.LongBreakNotify : false;
    this.VacationMode = copyFrom ? copyFrom.VacationMode : false;
    this.CustomPomodoroTask = copyFrom ? copyFrom.CustomPomodoroTask : false;
    this.CustomSetTask = copyFrom ? copyFrom.CustomSetTask : false;
    this.PomodoroSetTaskId = copyFrom ? copyFrom.PomodoroSetTaskId : null;
    this.PomodoroTaskId = copyFrom ? copyFrom.PomodoroTaskId : null;
    this.HideEdit = copyFrom ? copyFrom.HideEdit : false;
    this.ConnectHabitica = copyFrom ? copyFrom.ConnectHabitica : true;
    this.MuteBlockedSites = copyFrom ? copyFrom.MuteBlockedSites : true;
    this.TranspartOverlay = copyFrom ? copyFrom.TranspartOverlay : true;
    this.TickSound = copyFrom ? copyFrom.TickSound : false;
    this.showSkipToBreak = copyFrom ? copyFrom.showSkipToBreak : false;

    //returns site object or false
    this.GetBlockedSite = function (hostname) {
        return this.BlockedSites[hostname];
    }

    this.GetSiteCost = function (site) {
        return site.cost;
    }

    this.GetSiteHostName = function (site) {
        return site.hostname;
    }

    this.GetSitePassExpiry = function (site) {
        return site.passExpiry;
    }

    this.isSitePassExpired = function (site) {
        return site.passExpiry <= Date.now();
    }

    this.RemoveBlockedSite = function (site) {
        if (site.hostname) {
            delete this.BlockedSites[site.hostname];
        } else
            delete this.BlockedSites[site];
    };
    this.AddBlockedSite = function (hostname, cost, passExpiry) {
        this.BlockedSites[hostname] = new BlockedSite(hostname, cost, passExpiry);
        return this.BlockedSites[hostname];
    }

}

function BlockedSite(hostname, cost, passExpiry) {
    this.hostname = hostname;
    this.cost = cost;
    this.passExpiry = passExpiry;
}

// Checks the hostname and block it if the user dosent have enough gold or pomodoro is active.
// Returns Json object:
// if site not blocked: {block:false}
// if site is blocked and affordable: {block:true, payToPass: true, cost:string , hostname:string ,passTime:string}
// if site is blocked and not affordable {block:true, payToPass: false, hostname:string}
function checkBlockedUrl(siteUrl) {

    var hostname = siteUrl.hostname;

    //free pass during break session, or Vacation Mode and not in pomodoro session
    var freePass = (Vars.UserData.BreakFreePass && Vars.onBreak && Vars.TimerRunnig) || (Vars.UserData.VacationMode && (!Vars.TimerRunnig || Vars.onBreak));
    var site = Vars.UserData.GetBlockedSite(hostname);
    var pomodoro = Vars.TimerRunnig && !Vars.onBreak;

    if (!site || site.passExpiry > Date.now() || pomodoro || site.cost == 0 || freePass || !Vars.UserData.ConnectHabitica) {
        return {
            block: false
        }; //do not block
    };

    FetchHabiticaData(true);
    if (site.cost > Vars.Monies) {
        return {
            block: true,
            payToPass: false,
            hostname: hostname
        } //block website - can't afford
    } else return {
        block: true,
        payToPass: true,
        cost: site.cost.toFixed(2),
        hostname: hostname,
        passTime: Vars.UserData.PassDurationMins
    } //block website - pay to pass
}

var callbackTabActive = function (details) {
    chrome.tabs.get(details.tabId, function callback(tab) {
        chrome.tabs.insertCSS({
            file: "pageOverlay.css"
        });
        mainSiteBlockFunction(tab);
    });
};

function callbackTabUpdate(tabId) {
    chrome.tabs.get(tabId, function callback(tab) {
        //css insert
        chrome.tabs.insertCSS({
            file: "pageOverlay.css"
        });
        mainSiteBlockFunction(tab);
    });

}


function mainSiteBlockFunction(tab) {
    if (!Vars.TimerRunnig || Vars.onBreak) {
        unblockSiteOverlay(tab);
        var site = new URL(tab.url);
        var checkSite = checkBlockedUrl(site);

        //block - Pay to pass or can't afford page
        if (checkSite.block == true) {

            //pay to pass  
            if (checkSite.payToPass == true) {
                payToPassOverlay(tab, checkSite);
            }

            //can't afford
            else {
                cantAffordOverlay(tab, checkSite);
            }
            return;
        }

        //Check if the user is not on the same site for longer than passDuration
        var passDurationMiliSec = Vars.UserData.PassDurationMins * 60 * 1000
        setTimeout(function (arg) {
            mainSiteBlockFunction(arg);
        }, passDurationMiliSec, tab);
       
        muteBlockedtabs();
    }
}

//Create "Pay X coins To Visit" site overlay
function payToPassOverlay(tab, site) {
    var opacity = Vars.UserData.TranspartOverlay ? "0.85" : "1"; 
    var imageURLPayToPass = chrome.extension.getURL("/img/siteKeeper2.png");
    chrome.tabs.insertCSS({
        code: `
        .payToPass:after { background-image:url("` + imageURLPayToPass + `"); }
        .payToPass::before {background-color:rgba(0,0,0,`+opacity+`)}`
    });

    chrome.tabs.executeScript(tab.id, {
        file: 'pageOverlay.js'
    }, function (tab) {
        chrome.tabs.executeScript(tab.id, {
            code: `
            document.getElementById("payToPass_btn").style.display = 'block';
            document.getElementById("SitekeeperOverlay").style.display = 'block';
            document.getElementById("SitekeeperOverlay").setAttribute("data-html","You're trying to Access ` + site.hostname + `\\n Pay ` + site.cost + ` Gold to access for ` + site.passTime + ` Minutes ");
            document.getElementById("SitekeeperOverlay").className = "payToPass"; `
        });
    });
}

//Create "Cant Afford To Visit" site overlay
function cantAffordOverlay(tab, site) {
    var opacity = Vars.UserData.TranspartOverlay ? "0.85" : "1"; 
    var imageURLNoPass = chrome.extension.getURL("/img/siteKeeper3.png");
    chrome.tabs.insertCSS({
        code: `
        .noPass:after { background-image:url("` + imageURLNoPass + `"); }
        .noPass::before {background-color:rgba(0,0,0,`+opacity+`)}`
    });

    chrome.tabs.executeScript(tab.id, {
        file: 'pageOverlay.js'
    }, function (tab) {
        chrome.tabs.executeScript(tab.id, {
            code: `
            document.getElementById("SitekeeperOverlay").style.display = 'block'; 
            document.getElementById("payToPass_btn").style.display = 'none';
            document.getElementById("SitekeeperOverlay").setAttribute("data-html","You can't afford to visit ` + site.hostname + `\\n You shall not pass! ");
            document.getElementById("SitekeeperOverlay").className = "noPass"; `
        });
    });
}


//Switching and updating tabs
chrome.tabs.onActivated.addListener(callbackTabActive);
chrome.tabs.onUpdated.addListener(function (tabid, changeinfo, tab) {
    var url = tab.url;
    if (url !== undefined && changeinfo.status == "complete") {
        callbackTabUpdate(tabid);
    }
});

// ReSharper disable once PossiblyUnassignedProperty
chrome.storage.sync.get(Consts.userDataKey, function (result) {
    if (result[Consts.userDataKey]) {
        Vars.UserData = new UserSettings(result[Consts.userDataKey]);
        FetchHabiticaData();
    }
});

//Set Pomodoros Today from storage
chrome.storage.sync.get(Consts.PomodorosTodayDataKey, function (result) {
    if (result[Consts.PomodorosTodayDataKey]) {
        Vars.PomodorosToday = result[Consts.PomodorosTodayDataKey];
    }
});

//Mute all tabs with blocked sites, unmute other tabs.
function muteBlockedtabs() {
    var pomodoro = Vars.TimerRunnig && !Vars.onBreak;
    if (Vars.UserData.MuteBlockedSites) {
        chrome.tabs.getAllInWindow(null, function (tabs) {
            for (var i = 0; i < tabs.length; i++) {
                var hostname = new URL(tabs[i].url).hostname;
                var site = Vars.UserData.GetBlockedSite(hostname);
                if (!site) {
                    chrome.tabs.update(tabs[i].id, {
                        "muted": false
                    });
                } else if (checkBlockedUrl(site).block || pomodoro) {
                    chrome.tabs.update(tabs[i].id, {
                        "muted": true
                    });
                } else {
                    chrome.tabs.update(tabs[i].id, {
                        "muted": false
                    });
                }
            }
        });
    }
}

// ----- Habitica Api general call ----- //
function callAPI(method, route, postData) {
    if (!Vars.UserData.ConnectHabitica) {
        return null;
    }
    return callHabiticaAPI(Consts.serverUrl + route, Consts.xClientHeader, Vars.UserData.Credentials, method, postData);
}

function getData(silent, credentials, serverPath) {
    if (!Vars.UserData.ConnectHabitica) {
        return null;
    }
    var xhr = getHabiticaData(Consts.serverUrl + serverPath, Consts.xClientHeader, credentials);
    Vars.ServerResponse = xhr.status;
    if (xhr.status == 401) {
        chrome.notifications.create(Consts.NotificationId, {
                type: "basic",
                iconUrl: "img/icon.png",
                title: "Habitica SitePass Credentials Error",
                message: "Click on the extension icon at the top right of your browser to set your credentials."
            },
            function () {});
        return null;
    } else if (xhr.status != 200) {
        if (!silent) {
            chrome.notifications.create(Consts.NotificationId, {
                    type: "basic",
                    iconUrl: "img/icon.png",
                    title: "Habitica SitePass Connection Error",
                    message: "The service might be temporarily unavailable. Contact the developer if it persists. Error =" +
                        xhr.status
                },
                function () {});
        }
        return null;
    }
    return JSON.parse(xhr.responseText);
}

function FetchHabiticaData(skipTasks) {
    var credentials = Vars.UserData.Credentials;
    var userObj = getData(false, credentials, Consts.serverPathUser);
    if (userObj == null) return;
    else {
        Vars.Monies = userObj.data["stats"]["gp"];
        Vars.Exp = userObj.data["stats"]["exp"];
        Vars.Hp = userObj.data["stats"]["hp"];
    }
    if (!skipTasks) {
        var tasksObj;

        //get custom pomodoro tasks list (all habits)
        var allHabits;
        allHabits = getData(true, credentials, Consts.serverPathUserHabits);
        console.log(allHabits);
        if (allHabits.success) {
            Vars.PomodoroTaskCustomList = [];
            for (var i in allHabits.data) {
                var title = allHabits.data[i].text;
                var id = allHabits.data[i].id;
                Vars.PomodoroTaskCustomList.push({
                    title,
                    id
                });
            }
            console.log(Vars.PomodoroTaskCustomList);
        }

        //get pomodoro task id
        if (!Vars.UserData.CustomPomodoroTask) {
            tasksObj = getData(true, credentials, Consts.serverPathPomodoroHabit);
            if (tasksObj && tasksObj.data["alias"] == Consts.PomodoroHabitTemplate.alias) {
                Vars.PomodoroTaskId = tasksObj.data.id;
            } else {
                var result = CreatePomodoroHabit();
                if (result.error) {
                    notify("ERROR", result.error);
                } else {
                    Vars.PomodoroTaskId = result;
                }

            }
        } else {
            Vars.PomodoroTaskId = Vars.UserData.PomodoroTaskId;
        }

        //get pomodoro Set task id
        if (!Vars.UserData.CustomSetTask) {
            tasksObj = getData(true, credentials, Consts.serverPathPomodoroSetHabit);
            if (tasksObj && tasksObj.data["alias"] == Consts.PomodoroSetHabitTemplate.alias) {
                Vars.PomodoroSetTaskId = tasksObj.data.id;
            } else {
                var result = CreatePomodoroSetHabit();
                if (result.error) {
                    notify("ERROR", result.error);
                } else {
                    Vars.PomodoroSetTaskId = result;
                }

            }
        } else {
            Vars.PomodoroSetTaskId = Vars.UserData.PomodoroSetTaskId;
        }

        //Reward task update/create
        tasksObj = getData(true, credentials, Consts.serverPathTask);
        if (tasksObj && tasksObj.data["alias"] == "sitepass") {
            Vars.RewardTask = tasksObj.data;
            //UpdateRewardTask(0, false);
            return;
        }
        UpdateRewardTask(0, true);
    }
}

function UpdateRewardTask(cost, create) {
    Vars.RewardTask.value = cost;
    var xhr = new XMLHttpRequest();
    if (create) {
        xhr.open("POST", Consts.serverUrl + Consts.serverPathUserTasks, false);
    } else {
        xhr.open("PUT", Consts.serverUrl + Consts.serverPathTask, false);
    }
    xhr.setRequestHeader('x-client', Consts.xClientHeader);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.setRequestHeader("x-api-user", Vars.UserData.Credentials.uid);
    xhr.setRequestHeader("x-api-key", Vars.UserData.Credentials.apiToken);
    var data = {
        "data": Vars.RewardTask
    }
    xhr.send(JSON.stringify(Vars.RewardTask));
    Vars.RewardTask = JSON.parse(xhr.responseText).data;

}

function CreatePomodoroHabit() {
    var data = JSON.stringify(Consts.PomodoroHabitTemplate);
    var p = JSON.parse(callAPI("POST", Consts.serverPathUserTasks, data));
    if (p.success != true) {
        return {
            error: 'Failed to Create Pomodoro Habit task'
        };
    } else {
        return p.data.id;
    }
}

function CreatePomodoroSetHabit() {
    var data = JSON.stringify(Consts.PomodoroSetHabitTemplate);
    var p = JSON.parse(callAPI("POST", Consts.serverPathUserTasks, data));
    if (p.success != true) {
        return {
            error: 'Failed to Create Pomodoro Set Habit task'
        };
    } else {
        return p.data.id;
    }
}

//Confirm Purchase
chrome.runtime.onMessage.addListener(function (message) {
    if (message.msg == "Confirm_Purchase" && message.sender == "HabiticaPomodoro") {
        var site = Vars.UserData.GetBlockedSite(message.hostname);
        console.log('confirming Purchase for '+ site.hostname);
        ConfirmPurchase(site);
    }
});

function ConfirmPurchase(site) {
    UpdateRewardTask(site.cost,false);
    var p = JSON.parse(callAPI("POST", Consts.serverPathTask + "/score/down"));
    if (p.success != true) {
        notify("ERROR",'Failed to pay '+site.cost + 'coins for '+site.hostname+' in Habitica'); 
    }else{
        Vars.Monies -= site.cost;
        var passDurationMiliSec = Vars.UserData.PassDurationMins * 60 * 1000;
        site.passExpiry = Date.now() + passDurationMiliSec;
    }
}

//direction 'up' or 'down'
function ScoreHabit(habitId, direction) {
    var p = JSON.parse(callAPI("POST", '/tasks/' + habitId + '/score/' + direction));
    if (p.success != true) {
        return {
            error: 'Failed to score task ' + habitId + ', doublecheck its ID'
        };
    }
    return {
        lvl: p.data.lvl,
        hp: p.data.hp,
        exp: p.data.exp,
        mp: p.data.mp,
        gp: p.data.gp
    };
}

// ------------- Pomodoro Timer ---------------------------

var timerInterval; //Used for timer interval in startTimer() function.

/**
 * Start Timer: 
 * @param {int} duration the duration in seconds.
 * @param {function} duringTimerFunction this function runs every second while the timer runs.
 * @param {function} endTimerFunction this function runs when timer reachs 00:00.
 */
function startTimer(duration, duringTimerFunction, endTimerFunction) {
    var timer = duration,
        minutes, seconds;
    var duringTimer = function () {
        duringTimerFunction()
    };
    var endTimer = function () {
        endTimerFunction()
    };

    timerInterval = setInterval(function () {

        Vars.Timer = secondsToTimeString(timer);
        Vars.TimerValue = timer;

        duringTimer();

        //Times Up
        if (--timer < 0) {
            endTimer();
        }

    }, 1000);
}

//Convert seconds to time string, for example: 65 -> "01:05"
function secondsToTimeString(seconds) {
    var minutes = parseInt(seconds / 60, 10)
    var seconds = parseInt(seconds % 60, 10);
    minutes = minutes < 10 ? "0" + minutes : minutes;
    seconds = seconds < 10 ? "0" + seconds : seconds;
    return minutes + ":" + seconds;
}

//start pomodoro session - duration in seconds
function startPomodoro() {
    var duration = 60 * Vars.UserData.PomoDurationMins;
    Vars.TimerRunnig = true;
    Vars.onBreak = false;
    startTimer(duration, duringPomodoro, pomodoroEnds);
    muteBlockedtabs();
}

//runs during pomodoro session
function duringPomodoro() {
    //Show time on icon badge 
    chrome.browserAction.setBadgeBackgroundColor({
        color: "green"
    });
    chrome.browserAction.setBadgeText({
        text: Vars.Timer
    });
    //Block current tab if necessary
    CurrentTab(blockSiteOverlay);
    
    //Tick Sound
    if(Vars.UserData.TickSound){
        playSound("clockTicking");
    }
}


//runs When Pomodoro Timer Ends
function pomodoroEnds() {
    stopTimer();
    var title = "Time's Up"
    var msg = "Pomodoro ended." + "\n" + "You have done " + Vars.PomodorosToday.value + " today!"; //default msg if habit not enabled
    var setComplete = Vars.PomoSetCounter >= Vars.UserData.PomoSetNum - 1;
    //If Pomodoro / Pomodoro Set Habit + is enabled
    if ((Vars.UserData.PomoHabitPlus || (setComplete && Vars.UserData.PomoSetHabitPlus)) && !noReward) {
        FetchHabiticaData(true);
        var result = (setComplete && Vars.UserData.PomoSetHabitPlus) ? ScoreHabit(Vars.PomodoroSetTaskId, 'up') : ScoreHabit(Vars.PomodoroTaskId, 'up');
        if (!result.error) {
            var deltaGold = (result.gp - Vars.Monies).toFixed(2);
            var deltaExp = (result.exp - Vars.Exp).toFixed(2);
            msg = "You Earned Gold: +" + deltaGold + "\n" + "You Earned Exp: +" + deltaExp;
            FetchHabiticaData(true);
        } else {
            msg = "ERROR: " + result.error;
        }
    }
    //update Pomodoros today
    Vars.PomodorosToday.value++;
    var Pomodoros = {};
    Pomodoros[Consts.PomodorosTodayDataKey] = Vars.PomodorosToday;
    chrome.storage.sync.set(Pomodoros, function () {
        console.log('PomodorosToday is set to ' + JSON.stringify(Pomodoros));
    });

    Vars.PomoSetCounter++; //Updae set counter

    if (setComplete) {
        title = "Pomodoro Set Complete!";
    }
    if (Vars.UserData.ManualBreak) {
        manualBreak();
    } else {
        startBreak();
    }

    //Badge
    chrome.browserAction.setBadgeBackgroundColor({
        color: "green"
    });
    chrome.browserAction.setBadgeText({
        text: "\u2713"
    });

    //notify
    notify(title, msg);

    //play sound
    playSound("pomodoroEnd");
}

//start break session - duration in seconds
function startBreak() {
    var duration;
    if (Vars.PomoSetCounter == Vars.UserData.PomoSetNum) {
        duration = 60 * Vars.UserData.LongBreakDuration
    } else {
        duration = 60 * Vars.UserData.BreakDuration;
    }
    stopTimer();
    Vars.TimerRunnig = true;
    Vars.onBreak = true;
    startTimer(duration, duringBreak, breakEnds);
}

//take manual break (in popup quick setting) - duration in seconds
function takeBreak(duration) {
    stopTimer();
    Vars.PomoSetCounter = Vars.UserData.PomoSetNum;
    Vars.onManualTakeBreak = true;
    Vars.TimerRunnig = true;
    Vars.onBreak = true;
    startTimer(60 * duration, duringBreak, breakEnds);
}

//start break session - duration in seconds
function manualBreak() {
    stopTimer();
    Vars.TimerRunnig = false;
    Vars.onBreak = true;
    Vars.Timer = "Nice!";
}

//runs during Break session
function duringBreak() {
    //Show time on icon badge 
    chrome.browserAction.setBadgeBackgroundColor({
        color: "blue"
    });
    chrome.browserAction.setBadgeText({
        text: Vars.Timer
    });
}

//runs when Break session ends
function breakEnds() {
    stopTimer();
    var msg;
    if (Vars.PomoSetCounter == Vars.UserData.PomoSetNum) {
        msg = Vars.onManualTakeBreak ? "Break is 0ver" : "Long Break is over";
        pomoReset();
        if (Vars.UserData.LongBreakNotify) {
            notifyHabitica(msg);
        }
    } else {
        msg = "Back to work";
        startBreakExtension(Vars.UserData.BreakExtention * 60);
    }
    //notify
    notify("Time's Up", msg);
    //play sound
    playSound("breakEnd");
}

//start break session - duration in seconds
function startBreakExtension(duration) {
    stopTimer();
    Vars.TimerRunnig = true;
    Vars.onBreakExtension = true;
    Vars.onBreak = true;
    startTimer(duration, duringBreakExtension, pomodoroInterupted);
    if (Vars.UserData.BreakExtentionNotify) {
        notifyHabitica("Back to work! " + secondsToTimeString(Vars.UserData.BreakExtention * 60) + " minutes left for Break Extension.");
    }
}

//runs during Break session
function duringBreakExtension() {
    //Show time on icon badge 
    chrome.browserAction.setBadgeBackgroundColor({
        color: "red"
    });
    chrome.browserAction.setBadgeText({
        text: Vars.Timer
    });
}

//runs when pomodoro is interupted (stoped before timer ends/break extension over)
function pomodoroInterupted() {
    var failedBreakExtension = Vars.UserData.BreakExtentionFails && Vars.onBreakExtension;
    var breakExtensionZero = !Vars.UserData.BreakExtentionFails && (Vars.UserData.BreakExtention == 0);
    pomoReset();
    if (breakExtensionZero) {
        return;
    }
    if (Vars.UserData.PomoHabitMinus || failedBreakExtension) {
        FetchHabiticaData(true);
        var result = ScoreHabit(Vars.PomodoroTaskId, 'down');
        var msg = "";
        if (!result.error) {
            var deltaHp = (result.hp - Vars.Hp).toFixed(2);
            msg = "You Lost Health: " + deltaHp;
            FetchHabiticaData(true);
        } else {
            msg = "ERROR: " + result.error;
        }
        console.log(msg);
        notify("Pomodoro Failed!", msg);
    }
}

//Stop timer
function stopTimer() {

    clearInterval(timerInterval);
    Vars.Timer = "00:00";
    chrome.browserAction.setBadgeText({
        text: ''
    });

    CurrentTab(unblockSiteOverlay); //if current tab is blocked, unblock it
    CurrentTab(mainSiteBlockFunction); //ConfirmPurchase check
    Vars.TimerRunnig = false;
    Vars.onBreak = false;
    Vars.onBreakExtension = false;

}

//Stop timer - reset to start position
function pomoReset() {
    stopTimer()
    Vars.PomoSetCounter = 0; //Reset Pomo set Count
    Vars.onManualTakeBreak = false;
}

//End pomodoro and start a break
function skipToBreak() {
    stopTimer();
    var title = "Time's Up";
    var msg = "Take a break";
    Vars.PomoSetCounter++; //Updae set counter
    startBreak(); 
    
    //notify
    notify(title, msg);
}

//Create Chrome Notification
function notify(title, message, callback) {
    var options = {
        title: title,
        message: message,
        type: "basic", // Which type of notification to display - https://developer.chrome.com/extensions/notifications#type-TemplateType
        iconUrl: "img/icon.png" // A URL to the sender's avatar, app icon, or a thumbnail for image notifications.
    };
    // The first argument is the ID, if left blank it'll be automatically generated.
    // The second argument is an object of options. More here: https://developer.chrome.com/extensions/notifications#type-NotificationOptions
    return chrome.notifications.create("", options, callback);
}

//Run function(tab) on currentTab
function CurrentTab(func) {
    chrome.tabs.query({
            'active': true,
            'windowId': chrome.windows.WINDOW_ID_CURRENT
        },
        function (tabs) {
            if (tabs[0]) {
                func(tabs[0]);
            }
        });
}

//Block Site With Timer Overlay
function blockSiteOverlay(tab) {
    var opacity = Vars.UserData.TranspartOverlay ? "0.85" : "1"; 
    var site = new URL(tab.url).hostname;
    var message = "Stay Focused! Time Left: " + Vars.Timer;
    if (Vars.UserData.GetBlockedSite(site)) {
        chrome.tabs.executeScript({
            code: `
            document.body.classList.add('blockedSite');
            document.body.setAttribute('data-html',"` + message + `");            
            `
        });
        var imageURL = chrome.extension.getURL("/img/siteKeeper.png");
        chrome.tabs.insertCSS({
            code: `
            .blockedSite:after {background-image:url("` + imageURL + `");}
            .blockedSite:before{background-color:rgba(0,0,0,`+opacity+`)}
            `
        });
    };
}

//Remove Overlay from current Blocked Site
function unblockSiteOverlay(tab) {
    chrome.tabs.executeScript(tab.id, {
        code: `document.body.className = document.body.className.replace( "blockedSite", '' );
            var blockElementExists = document.getElementById("SitekeeperOverlay");
            if(blockElementExists){
                document.getElementById("SitekeeperOverlay").style.display = 'none'; 
            }
            `
    });
}

//Sends Private Message to the user in Habitica (Used as notification in the mobile app!)
function notifyHabitica(msg) {
    var data = {
        message: msg,
        toUserId: Vars.UserData.Credentials.uid
    };
    callAPI("POST", 'members/send-private-message', JSON.stringify(data));
}

function playSound(sound) {
    if (Vars.UserData.SoundNotify) {
        var myAudio;
        switch (sound) {
            case "pomodoroEnd":
                myAudio = new Audio(chrome.runtime.getURL("audio/pomodoroEnd.mp3"));
                break;
            case "breakEnd":
                myAudio = new Audio(chrome.runtime.getURL("audio/breakEnd.mp3"));
                break;
            case "clockTicking":
                myAudio = new Audio(chrome.runtime.getURL("audio/clockTicking.mp3"));
                break;
                
        }
        myAudio.play();
    }
}