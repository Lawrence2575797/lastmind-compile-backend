import { fsrs, generatorParameters } from 'ts-fsrs';

const params = generatorParameters({
  request_retention: 0.92,
  maximum_interval: 36500,
  enable_short_term: false,
});
const scheduler = fsrs(params) as any;

console.log('next_interval(2.307, 0) =', scheduler.next_interval(2.307, 0));
console.log('next_interval(9.190, 0) =', scheduler.next_interval(9.190, 0));
console.log('next_interval(1.293, 0) =', scheduler.next_interval(1.293, 0));
console.log('next_interval(0.083, 0) =', scheduler.next_interval(0.083, 0));
console.log('next_interval(0.212, 0) =', scheduler.next_interval(0.212, 0));
