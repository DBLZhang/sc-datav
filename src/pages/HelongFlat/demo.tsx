import { useEffect } from "react";
import styled from "styled-components";
import { useConfigStore } from "./stores";
import Map from "./map";

const Wrapper = styled.div`
  position: fixed;
  inset: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background-color: #000000;
`;

export default function Index() {
  useEffect(() => {
    return useConfigStore.getState().reset();
  }, []);
  return (
    <Wrapper>
      <Map />
    </Wrapper>
  );
}
