import {BaseEdge,EdgeLabelRenderer,type EdgeProps} from '@xyflow/react';
import type {DiagramEdge} from './koboQuestionFlowLayout';

export default function KoboFlowRoute({id,data,markerEnd,style}:EdgeProps<DiagramEdge>){
 if(!data?.points.length)return null;
 const path=data.points.map((point,index)=>`${index?'L':'M'} ${point.x} ${point.y}`).join(' ');
 return <><BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={0}/>{data.showLabel&&<EdgeLabelRenderer><button type="button" className="qf-route-label nodrag nopan" style={{transform:`translate(-50%, -50%) translate(${data.labelPoint.x}px,${data.labelPoint.y}px)`}} onClick={data.onInspect} aria-label={data.caption}>{data.caption}</button></EdgeLabelRenderer>}</>;
}
