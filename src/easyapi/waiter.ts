import { App, moment } from "obsidian";
import { EasyAPI } from "./easyapi";


export class Waiter {
    app:App;
    ea:EasyAPI;
    constructor(app:App,ea:EasyAPI){
        this.app = app;
        this.ea = ea;
    }

    async wait(condition: () => boolean, timeout: number = 0){
        let start = this.ea.time.moment();
        while (!condition()) {
            let end = this.ea.time.moment();
            if (timeout > 0 && (end.valueOf() - start.valueOf()) / 1000 > timeout) {
                return false;
            }
            await new Promise(resolve => window.setTimeout(resolve, 100));
        }
        return true;
    }

    async wait_for<T>(vfunc: () => T | Promise<T>, timeout: number = 30): Promise<T | null> {
        let start = this.ea.time.moment();
        let res = await vfunc();
        while (!res) {
            let end = this.ea.time.moment();
            if (timeout > 0 && (end.valueOf() - start.valueOf()) / 1000 > timeout) {
                return null;
            }
            await new Promise(resolve => window.setTimeout(resolve, 100));
            res = await vfunc();
        }
        return res;
    }
}