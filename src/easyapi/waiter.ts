import { App, TFile,moment } from "obsidian";
import { EasyAPI } from "./easyapi";


export class Waiter {
    app:App;
    ea:EasyAPI;
    constructor(app:App,ea:EasyAPI){
        this.app = app;
        this.ea = ea;
    }

    async wait(condition:Function,timeout:number=0){
        let start = moment();
        while (!condition()) {
            let end = moment();
            if ((start.valueOf()-end.valueOf())/1000 > timeout) {
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return true;
    }

    async wait_for(vfunc:Function,timeout:number=30){
        let start = moment();
        let res = await vfunc();
        while (!res) {
            let end = moment();
            if ((start.valueOf()-end.valueOf())/1000 > timeout) {
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            res = await vfunc();
        }
        return res;
    }
}