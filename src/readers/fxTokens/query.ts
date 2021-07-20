﻿import { gql } from "graphql-request/dist";

export default gql`
  query {
    fxTokens {
      id
      name
      symbol
      totalSupply
      isValid
      decimals
      rate
    }
  }
`;
