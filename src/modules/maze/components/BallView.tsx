import React, { forwardRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { BALL_COLOR } from '../constants';

/** 纯色小球：位置/直径全部由引擎 setNativeProps 直写 */
const BallView = forwardRef<View>((_props, ref) => {
  return <View ref={ref} style={styles.ball} />;
});

export default BallView;

const styles = StyleSheet.create({
  ball: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BALL_COLOR,
  },
});
