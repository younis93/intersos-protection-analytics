import {buildKoboBulkCopy} from './koboBulkCopy';
import type {KoboAnalysis} from './koboTypes';
self.onmessage=async(event:MessageEvent<{analysis:KoboAnalysis;sorts:Map<string,Map<string,unknown>>}>)=>{
 try{const result=await buildKoboBulkCopy(event.data.analysis,event.data.sorts,message=>self.postMessage({progress:message}));self.postMessage({result})}
 catch(issue){self.postMessage({error:issue instanceof Error?issue.message:String(issue)})}
};
