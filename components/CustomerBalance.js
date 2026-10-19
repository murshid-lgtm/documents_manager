'use client';
import FinancialSnapshot from './FinancialSnapshot';
export default function CustomerBalance(props){return props.customerId?<FinancialSnapshot {...props}/>:null}
