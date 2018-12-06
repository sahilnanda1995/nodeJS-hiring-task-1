
const _ = require('lodash');
const moment = require('moment');

const statslite = require('stats-lite');
const util = require('../../core/util');
const log = require(util.dirs().core + 'log')
const ENV = util.gekkoEnv();

const config = util.getConfig();
const perfConfig = config.performanceAnalyzer;
const watchConfig = config.watch;

const Logger = require('./logger');

const fs = require('fs');

const PerformanceAnalyzer = function() {
  _.bindAll(this);



  this.dates = {
    start: false,
    end: false
  }

  this.startPrice = 0;
  this.endPrice = 0;

  this.currency = watchConfig.currency;
  this.asset = watchConfig.asset;

  this.logger = new Logger(watchConfig);

  this.trades = 0;

  this.exposure = 0;
  
  this.roundTrips = [];
  this.losses = [];
  this.roundTrip = {
    id: 0,
    entry: false,
    exit: false
  }

  this.portfolio = {};
  this.balance;

  this.start = {};
  this.openRoundTrip = false;
}

PerformanceAnalyzer.prototype.processPortfolioValueChange = function(event) {
  if(!this.start.balance) {
    this.start.balance = event.balance;
  }
}

PerformanceAnalyzer.prototype.processPortfolioChange = function(event) {
  if(!this.start.portfolio) {
    this.start.portfolio = event;
  }
}

PerformanceAnalyzer.prototype.processCandle = function(candle, done) {
  this.price = candle.close;
  this.dates.end = candle.start.clone().add(1, 'minute');

  if(!this.dates.start) {
    this.dates.start = candle.start;
    this.startPrice = candle.close;
  }

  this.endPrice = candle.close;

  if(this.openRoundTrip) {
    this.emitRoundtripUpdate();
  }

  done();
}

PerformanceAnalyzer.prototype.emitRoundtripUpdate = function() {
  const uPnl = this.price - this.roundTrip.entry.price;

  this.deferredEmit('roundtripUpdate', {
    at: this.dates.end,
    duration: this.dates.end.diff(this.roundTrip.entry.date),
    uPnl,
    uProfit: uPnl / this.roundTrip.entry.total * 100
  })
}

PerformanceAnalyzer.prototype.processTradeCompleted = function(trade) {
  this.trades++;
  this.portfolio = trade.portfolio;
  this.balance = trade.balance;

  this.registerRoundtripPart(trade);

  const report = this.calculateReportStatistics();
  if(report) {
    this.logger.handleTrade(trade, report);
    this.deferredEmit('performanceReport', report);
  }
}

PerformanceAnalyzer.prototype.registerRoundtripPart = function(trade) {
  if(this.trades === 1 && trade.action === 'sell') {
    // this is not part of a valid roundtrip
    return;
  }

  if(trade.action === 'buy') {
    if (this.roundTrip.exit) {
      this.roundTrip.id++;
      this.roundTrip.exit = false
    }

    this.roundTrip.entry = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.currency + (trade.portfolio.asset * trade.price),
    }
    this.openRoundTrip = true;
  } else if(trade.action === 'sell') {
    this.roundTrip.exit = {
      date: trade.date,
      price: trade.price,
      total: trade.portfolio.currency + (trade.portfolio.asset * trade.price),
    }
    this.openRoundTrip = false;

    this.handleCompletedRoundtrip();
  }
}
var count = 0;
var countWin = 0;


PerformanceAnalyzer.prototype.handleCompletedRoundtrip = function() {
  


  var roundtrip = {
    id: this.roundTrip.id,

    entryAt: this.roundTrip.entry.date,
    entryPrice: this.roundTrip.entry.price,
    entryBalance: this.roundTrip.entry.total,

    exitAt: this.roundTrip.exit.date,
    exitPrice: this.roundTrip.exit.price,
    exitBalance: this.roundTrip.exit.total,

    duration: this.roundTrip.exit.date.diff(this.roundTrip.entry.date)
  }
  // for giving date and buy/sell price to the tradingView chart.
  let buyDate = new Date(roundtrip.entryAt);
  let sellDate = new Date(roundtrip.exitAt);
  roundtrip.pnl = roundtrip.exitBalance - roundtrip.entryBalance;
  roundtrip.profit = (100 * roundtrip.exitBalance / roundtrip.entryBalance) - 100;
  console.log("+++++++++-------++++++++++"+ roundtrip.profit);
  if (count == 0) {
    fs.writeFile('testResults.js', `tvWidget.chart().createShape({time: ${buyDate.getTime()/1000}, price: ${roundtrip.entryPrice}}, {shape: 'arrow_up'});\n`, function(err){
      if (err) console.log(err);
      console.log("Successfully Written to File.");

      fs.appendFile('testResults.js', `tvWidget.chart().createShape({time: ${sellDate.getTime()/1000}, price: ${roundtrip.exitPrice}}, {shape: 'arrow_down'});\n`, function(err){
        if (err) console.log(err);
        console.log("Successfully appended to File.");//{shape: 'balloon', text: "hey", backgroundColor: '#7FFF00', transparency: 0, fillBackground: true});
    });
    if (roundtrip.profit > 0){
        fs.appendFile('testResults.js', `tvWidget.chart().createShape({time: ${sellDate.getTime()/1000}}, {shape: 'balloon', text: ${roundtrip.profit}, backgroundColor: '#7FFF00', transparency: 20, fillBackground: true});\n`, function(err){
        if (err) console.log(err);
        console.log("Successfully appended to File.");
    });
  }else{
      fs.appendFile('testResults.js', `tvWidget.chart().createShape({time: ${sellDate.getTime()/1000}}, {shape: 'balloon', text: ${roundtrip.profit}, backgroundColor: '#FF4500', transparency: 20, fillBackground: true});\n`, function(err){
        if (err) console.log(err);
        console.log("Successfully appended to File.");
    });
  }
    });  
  }else {
    fs.appendFile('testResults.js', `tvWidget.chart().createShape({time: ${buyDate.getTime()/1000}, price: ${roundtrip.entryPrice}}, {shape: 'arrow_up'});\n`, function(err){
        if (err) console.log(err);
        console.log("Successfully appended to File.");
    });
    fs.appendFile('testResults.js', `tvWidget.chart().createShape({time: ${sellDate.getTime()/1000}, price: ${roundtrip.exitPrice}}, {shape: 'arrow_down'});\n`, function(err){
      if (err) console.log(err);
      console.log("Successfully appended to File.");
      if (roundtrip.profit > 0){
        fs.appendFile('testResults.js', `tvWidget.chart().createShape({time: ${sellDate.getTime()/1000}}, {shape: 'balloon', text: ${roundtrip.profit}, backgroundColor: '#7FFF00', transparency: 20, fillBackground: true});\n`, function(err){
        if (err) console.log(err);
        console.log("Successfully appended to File.");
      });
    }else{
        fs.appendFile('testResults.js', `tvWidget.chart().createShape({time: ${sellDate.getTime()/1000}}, {shape: 'balloon', text: ${roundtrip.profit}, backgroundColor: '#FF4500', transparency: 20, fillBackground: true});\n`, function(err){
        if (err) console.log(err);
        console.log("Successfully appended to File.");
      });
    }
  });
  }


  count++;

  if(roundtrip.profit > 0){
    countWin++;
//    console.log(count);
  }

  this.roundTrips[this.roundTrip.id] = roundtrip;

  this.logger.handleRoundtrip(roundtrip);

  this.deferredEmit('roundtrip', roundtrip);

  // update cached exposure
  this.exposure = this.exposure + Date.parse(this.roundTrip.exit.date) - Date.parse(this.roundTrip.entry.date);
  // track losses separately for downside report
  if (roundtrip.exitBalance < roundtrip.entryBalance)
    this.losses.push(roundtrip);
   
}

PerformanceAnalyzer.prototype.calculateReportStatistics = function() {
  if(!this.start.balance || !this.start.portfolio) {
    log.error('Cannot calculate a profit report without having received portfolio data.');
    log.error('Skipping performanceReport..');
    return false;
  }

  // the portfolio's balance is measured in {currency}
  const profit = this.balance - this.start.balance;

  const timespan = moment.duration(
    this.dates.end.diff(this.dates.start)
  );
  const relativeProfit = this.balance / this.start.balance * 100 - 100;
  const relativeYearlyProfit = relativeProfit / timespan.asYears();
  
  const percentExposure = this.exposure / (Date.parse(this.dates.end) - Date.parse(this.dates.start));

  const sharpe = (relativeYearlyProfit - perfConfig.riskFreeReturn) 
    / statslite.stdev(this.roundTrips.map(r => r.profit)) 
    / Math.sqrt(this.trades / (this.trades - 2));
  
  const downside = statslite.percentile(this.losses.map(r => r.profit), 0.25)
    * Math.sqrt(this.trades / (this.trades - 2));

  const report = {
    startTime: this.dates.start.utc().format('YYYY-MM-DD HH:mm:ss'),
    endTime: this.dates.end.utc().format('YYYY-MM-DD HH:mm:ss'),
    timespan: timespan.humanize(),
    market: this.endPrice * 100 / this.startPrice - 100,

    balance: this.balance,
    profit,
    relativeProfit: relativeProfit,

    yearlyProfit: profit / timespan.asYears(),
    relativeYearlyProfit,

    startPrice: this.startPrice,
    endPrice: this.endPrice,
    trades: this.trades,
    startBalance: this.start.balance,
    exposure: percentExposure,
    sharpe,
    downside,
    hit_ratio: countWin/count * 100
  }

  report.alpha = report.profit - report.market;

  return report;
}

PerformanceAnalyzer.prototype.finalize = function(done) {
  if(!this.trades) {
    return done();
  }

  const report = this.calculateReportStatistics();
  if(report) {
    this.logger.finalize(report);
  }
  done();
}


module.exports = PerformanceAnalyzer;
