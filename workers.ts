declare var importScripts: (...scripts: string[]) => void;
const IS_WEBWORKER = typeof importScripts === "function";

interface Window {
    postMessage(message: any);
}

module Workers {

    var counter = 0;

    type Method = (...args: any[]) => any;
    type UnwrapPromise<P> = P extends Promise<infer V> ? V : P;
    type ProxiedFunction<F extends Method> = 
        (...params: Parameters<F>) => Promise<UnwrapPromise<ReturnType<F>>>;

    export interface IProxy {
        dispose();
    }

    export type Proxy<T> = IProxy & {
        [P in keyof T]: T[P] extends Method ?
        ProxiedFunction<T[P]>       
        :
        never
    };

    interface RpcCall {
        id: number;
        method: string;
        arguments: any[];
        transfer: any[];
    }

    interface RpcCallReturn {
        id: number;
        result?: any;
        errorMessage?: string;
        errorName?: string;
        hasResult: boolean;
    }

    interface RpcPromise {
        resolve: Function;
        reject: Function;
    }

    function returnResult(id, result) {
        self.postMessage(<RpcCallReturn>{ id: id, result: result, hasResult: true });
    }

    function returnError(id, error: Error) {
        self.postMessage(<RpcCallReturn>{ id: id, errorMessage: error.message, errorName: error.name, hasResult: false });
    }

    export class Host {

        static sourceFile: string;

        static createClient<T>(): Proxy<T>
        static createClient<T>(classDef): Proxy<T>
        static createClient<T>(classDef = this): Proxy<T> {
            var proto = classDef.prototype;

            var client = new Client(new Worker(classDef.sourceFile));
            Object.getOwnPropertyNames(proto).forEach(key => {
                var prop = proto[key];

                if (typeof prop !== "function")
                    return;

                function this_is_a_proxied_method() {
                    return client.rpcCall(key, Array.prototype.slice.call(arguments));
                };

                if (typeof client[key] !== "undefined")
                    return;

                Object.defineProperty(client, key, {
                    value: this_is_a_proxied_method,
                    enumerable: false, //prevent serialization failures
                    configurable: true
                });

            });

            return client as any;
        }

        static instance: Host;

        static registerWorker()
        static registerWorker(classDef)
        static registerWorker(classDef = this) {
            if (IS_WEBWORKER) {

                var instance = new classDef();

                self.onmessage = e => {

                    var call = <RpcCall>e.data;
                    var method = <Function>instance[call.method];

                    if (typeof method != "function")
                        throw new ReferenceError("Method not found: " + call.method);

                    try {
                        var result = method.apply(instance, call.arguments);

                        if (result instanceof Promise) {
                            (<Promise<any>>result).then(
                                value => returnResult(call.id, value),
                                error => returnError(call.id, error)
                            )
                        } else {
                            returnResult(call.id, result);
                        }
                    } catch (error) {
                        returnError(call.id, error);
                    }
                };

            } else {
                var cur = document.currentScript;
                if (cur instanceof HTMLScriptElement)
                    this.sourceFile = cur.src;
                else
                    return;

                var _instance: any;

                Object.defineProperty(classDef, "instance", {
                    get: function () { return (this._instance ? this._instance : (this._instance = <Client>this.createClient())); },
                    enumerable: true,
                    configurable: true
                });
            }
        }
    }

    export class Client {
        private callBackMap = new Map<number, RpcPromise>();

        constructor(public worker: Worker) {
            worker.onmessage = e => {
                var result = <RpcCallReturn>e.data;
                var callback = this.callBackMap.get(result.id);

                if (!callback)
                    return;

                this.callBackMap.delete(result.id);

                if (result.hasResult)
                    callback.resolve(result.result);
                else {
                    var err = new Error(result.errorMessage);
                    err.name = result.errorName;
                    callback.reject(err);
                }
            };
        }

        rpcCall(method: string, args: any) {
            return new Promise<any>((resolve, reject) => {
                var callbackId = counter++;
                this.callBackMap.set(callbackId, { resolve: resolve, reject: reject });

                this.worker.postMessage(<RpcCall>{
                    method: method,
                    id: callbackId,
                    arguments: args,
                    transfer: null
                });
            });
        }

        dispose() {
            this.worker.terminate();
        }
    }

}

if (typeof importScripts !== "function") {
    window["importScripts"] = <any>null;
}