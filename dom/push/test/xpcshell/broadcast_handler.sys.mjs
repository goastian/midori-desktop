export var broadcastHandler = {
  reset() {
    this.notifications = [];

    this.wasNotified = new Promise((resolve, reject) => {
      this.receivedBroadcastMessage = function () {
        resolve();
        this.notifications.push(Array.from(arguments));
      };
    });
  },
};
